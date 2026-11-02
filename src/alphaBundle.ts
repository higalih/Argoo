import { PublicKey } from "@solana/web3.js";
import { cached } from "./cache";
import { marketPulse } from "./endpoints";
import { tokenSafety } from "./tokenSafety";
import { whalePulse } from "./whalePulse";

const TTL_MS = 60_000; // Same 1-minute cache as the other tools.

// GET /api/insights/alpha-bundle?token=<mint>
// Composition only — no new RPC path, no new dependency, no new data source.
// Verdict rule LOCKED Mon 2026-11-02 (Greg), verdict-only in v1 (no bundle score):
//   AVOID if safety RISKY — absolute veto, no exception.
//   WAIT if CAUTION / signals disagree / key input missing.
//   BUY if SAFE + no contradiction, OR CAUTION + whale>0 + largest>=5% + RSI<30.
// Freeze cap (Nov 2): freeze authority active caps BUY to WAIT — never BUY
//   while freeze is active. Freeze can never be SAFE (max 70 → CAUTION), so
//   the cap only affects the CAUTION lift, by construction, not by omission.
// ponytail: each input is caught separately. An unavailable input lands in
// data_gaps, never invented, and (except the RISKY veto) forces WAIT.
// v1 note: marketPulse takes CoinGecko ids, not Solana mints, so for a mint
// input momentum is always missing in v1 → non-RISKY mints verdict WAIT.
// The lift code below is in place and fires once momentum resolves for mints.
// decideVerdict is pure (no RPC) so the rule is unit-testable: live mints
// cannot reach BUY in v1 (momentum missing), so only a pure test can prove
// the lift and the freeze cap before momentum exists for mints.
export function decideVerdict(input: {
  safety: any;
  whale: any;
  momentum: any;
}): { verdict: string; reasons: string[] } {
  const { safety, whale, momentum } = input;
  const level: string | null = safety?.safety_level ?? null;
  const score: number | null = safety?.safety_score ?? null;
  const freeze: string | null = safety?.checks?.freeze_authority ?? null;
  const topHolder: number | null =
    safety?.checks?.holder_concentration?.top_holder_pct ?? null;
  const whaleCount: number | null = whale?.summary?.whale_transfer_count ?? null;
  const largest: number | null = whale?.summary?.largest_transfer_pct ?? null;
  const rsi: number | null = momentum?.rsi_14d ?? null;
  const change: number | null = momentum?.change_24h_pct ?? null;

  const safetyBits = [
    score !== null ? `score ${score}` : null,
    freeze !== null ? `freeze ${freeze}` : null,
    topHolder !== null ? `top holder ${topHolder}%` : null,
  ].filter((x) => x !== null);
  const safetyDesc = safetyBits.length > 0 ? ` (${safetyBits.join(", ")})` : "";

  let verdict: string;
  const reasons: string[] = [];
  if (level === "RISKY") {
    // Absolute veto: checked before completeness, so a RISKY token is
    // AVOID even when other inputs are missing.
    verdict = "AVOID";
    reasons.push(
      `RISKY safety${safetyDesc} — safety vetoes momentum and whale signals.`,
    );
  } else if (!safety || !whale || !momentum) {
    verdict = "WAIT";
    if (!safety) reasons.push("Safety unavailable — cannot assess risk.");
    if (!whale) reasons.push("Whale data unavailable.");
    if (!momentum)
      reasons.push("Momentum unavailable (market_pulse takes CoinGecko ids, not mints).");
  } else if (level === "CAUTION") {
    // Lift needs all three: an actual whale transfer, a >=5% transfer,
    // and RSI below 30. Null RSI never lifts (null < 30 would be true).
    const lift =
      whaleCount !== null &&
      whaleCount > 0 &&
      largest !== null &&
      largest >= 5 &&
      rsi !== null &&
      rsi < 30;
    if (lift && freeze === "active") {
      // Freeze cap: a freezable token never gets BUY, even when the lift
      // conditions are met. It lands on WAIT, not AVOID — RISKY stays the
      // sole AVOID trigger, and stablecoins (freeze as compliance) land
      // on WAIT rather than AVOID.
      verdict = "WAIT";
      reasons.push(
        `CAUTION safety${safetyDesc} — freeze authority active caps BUY to WAIT (never BUY while freeze is active); would flip to BUY if freeze revoked and lift conditions hold (whale_transfer_count > 0 AND largest_transfer_pct >= 5% AND RSI < 30).`,
      );
    } else if (lift) {
      verdict = "BUY";
      reasons.push(
        `CAUTION safety${safetyDesc}, lifted by whale accumulation (${whaleCount} whale transfer(s), largest ${largest}% of supply) + oversold momentum (RSI ${rsi}).`,
      );
    } else {
      verdict = "WAIT";
      reasons.push(
        `CAUTION safety${safetyDesc} — would flip to BUY if: whale_transfer_count > 0 AND largest_transfer_pct >= 5% AND RSI < 30 (currently: whale ${whaleCount}, largest ${largest}%, RSI ${rsi}).`,
      );
    }
  } else if (level === "SAFE") {
    // v1 definition of "do not contradict": inputs are complete (checked
    // above) and momentum is not extremely overbought (RSI >= 70, the
    // conventional band symmetric to the <30 oversold line). Whale
    // transfers alone never contradict: a transfer is not a trade.
    // (Freeze cannot be SAFE: -30 caps it at 70 → CAUTION, so no freeze
    // check is needed here.)
    if (rsi !== null && rsi >= 70) {
      verdict = "WAIT";
      reasons.push(
        `SAFE safety${safetyDesc} but overbought momentum (RSI ${rsi}) — would flip to BUY if RSI cools below 70.`,
      );
    } else {
      verdict = "BUY";
      const changeBit = change !== null ? `, 24h change ${change}%` : "";
      reasons.push(
        `SAFE safety${safetyDesc} with momentum (RSI ${rsi}${changeBit}) and whale data (${whaleCount} whale transfer(s) in 24h) not contradicting.`,
      );
    }
  } else {
    verdict = "WAIT";
    reasons.push("Safety level unknown — cannot decide.");
  }
  return { verdict, reasons };
}

export async function alphaBundle(mint: string) {
  const pubkey = new PublicKey(mint); // throws on malformed mint; route maps it to 400
  void pubkey;
  return cached(`alpha:${mint}`, TTL_MS, async () => {
    const gaps: string[] = [];
    let safety: any = null;
    let whale: any = null;
    let momentum: any = null;
    try {
      safety = await tokenSafety(mint);
    } catch {
      gaps.push("safety");
    }
    try {
      whale = await whalePulse(mint);
    } catch {
      gaps.push("whale");
    }
    try {
      momentum = await marketPulse(mint);
    } catch {
      gaps.push("momentum");
    }
    for (const g of safety?.data_gaps ?? []) gaps.push(`safety:${g}`);
    for (const g of whale?.data_gaps ?? []) gaps.push(`whale:${g}`);

    const { verdict, reasons } = decideVerdict({ safety, whale, momentum });
    const sources = ["solana-rpc-devnet"];
    if (momentum) sources.push("coingecko");
    return {
      token: mint,
      verdict,
      reasons,
      inputs: {
        momentum: momentum
          ? { rsi_14d: momentum.rsi_14d, change_24h_pct: momentum.change_24h_pct }
          : null,
        safety: safety
          ? { safety_score: safety.safety_score, safety_level: safety.safety_level }
          : null,
        whale: whale
          ? {
              transfer_count_24h: whale.summary.transfer_count,
              whale_transfer_count: whale.summary.whale_transfer_count,
              largest_transfer_pct: whale.summary.largest_transfer_pct,
            }
          : null,
      },
      data_gaps: gaps,
      sources,
      as_of: new Date().toISOString(),
    };
  });
}

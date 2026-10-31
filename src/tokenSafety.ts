import { PublicKey } from "@solana/web3.js";
import { cached } from "./cache";
import { getConnection } from "./solana";

const TTL_MS = 60_000; // Same 1-minute cache as market-pulse.

// ponytail: LP lock, dev hold, and metadata mutability need pool discovery /
// a dev-wallet identity / Metaplex metadata parsing — none of which direct
// RPC gives for an arbitrary mint. They are explicit "unavailable" here, not
// guessed, and move to the mainnet phase with scanner integration.
const DATA_GAPS = ["lp_locked", "dev_hold", "metadata_mutable"];

// Transparent scoring, no hidden magic. Draft numbers — Greg adjusts.
// The level reflects only the checks actually run; see data_gaps for the rest.
function score(input: {
  mintActive: boolean;
  freezeActive: boolean;
  top1: number | null;
  top10: number | null;
}): { safety_score: number; safety_level: string } {
  let s = 100;
  if (input.mintActive) s -= 25; // creator can print more tokens
  if (input.freezeActive) s -= 30; // creator can freeze holders' tokens
  if (input.top1 !== null) {
    if (input.top1 > 50) s -= 20;
    else if (input.top1 > 20) s -= 10;
  }
  if (input.top10 !== null) {
    if (input.top10 > 80) s -= 15;
    else if (input.top10 > 50) s -= 10;
  }
  const level = s >= 80 ? "SAFE" : s >= 50 ? "CAUTION" : "RISKY";
  return { safety_score: s, safety_level: level };
}

// GET /api/insights/token-safety?token=<mint>
// Devnet path: direct Solana RPC only. Scanners (RugCheck/Birdeye) are
// mainnet-only — verified live 30 Oct 2026: RugCheck 400 "invalid token mint",
// Birdeye 404 "Not found" for the devnet USDC mint.
export async function tokenSafety(mint: string) {
  const pubkey = new PublicKey(mint); // throws on malformed mint; route maps it to 400
  return cached(`safety:${mint}`, TTL_MS, async () => {
    const conn = getConnection();
    const info = await conn.getParsedAccountInfo(pubkey);
    const parsed: any = (info.value?.data as any)?.parsed?.info;
    if (!parsed || parsed.mintAuthority === undefined) throw new Error("Not a token mint");
    const decimals: number = parsed.decimals ?? 0;
    const supplyUi = Number(parsed.supply ?? 0) / 10 ** decimals;
    const mintAuthority = parsed.mintAuthority ? "active" : "revoked";
    const freezeAuthority = parsed.freezeAuthority ? "active" : "revoked";
    const largest = await conn.getTokenLargestAccounts(pubkey);
    const amounts = (largest.value ?? []).map(
      (a: any) => a.uiAmount ?? Number(a.amount ?? 0) / 10 ** decimals,
    );
    const top1 = supplyUi > 0 && amounts.length > 0 ? (amounts[0] / supplyUi) * 100 : null;
    const top10 =
      supplyUi > 0 ? (amounts.slice(0, 10).reduce((sum, v) => sum + v, 0) / supplyUi) * 100 : null;
    const { safety_score, safety_level } = score({
      mintActive: mintAuthority === "active",
      freezeActive: freezeAuthority === "active",
      top1,
      top10,
    });
    return {
      token: mint,
      safety_score,
      safety_level,
      checks: {
        // Authority-based sell-block only: freeze active means the creator
        // can freeze holders' tokens. LP-based sellability is "unavailable"
        // on this path — never claimed, see data_gaps.
        honeypot: freezeAuthority === "active",
        holder_concentration: {
          top_holder_pct: top1 === null ? null : Math.round(top1 * 100) / 100,
          top10_pct: top10 === null ? null : Math.round(top10 * 100) / 100,
        },
        lp_locked: "unavailable",
        dev_hold: "unavailable",
        mint_authority: mintAuthority,
        freeze_authority: freezeAuthority,
        metadata_mutable: "unavailable",
      },
      data_gaps: DATA_GAPS,
      sources: ["solana-rpc-devnet"],
      as_of: new Date().toISOString(),
    };
  });
}

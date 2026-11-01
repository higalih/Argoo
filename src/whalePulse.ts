import { PublicKey } from "@solana/web3.js";
import { cached } from "./cache";
import { getConnection } from "./solana";

const TTL_MS = 60_000; // Same 1-minute cache as the other tools.
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h window (spec proposal).
const TOP_ACCOUNTS = 20;
const SIG_LIMIT = 100; // signatures per account; the window filter + global cap cut this down
const MAX_PARSED = 100; // newest signatures parsed per call (bounds RPC work)
const BATCH = 10; // concurrent parses per batch (cuts wall time vs sequential)
const MAX_TRANSFERS = 20;
const WHALE_PCT = 1; // >= 1% of supply counts as whale (spec proposal).

// ponytail: transfers are not trades — RPC alone cannot tell a trade from a
// wallet move, and coverage is top-accounts-only. Both are stated in the
// response (coverage + data_gaps), never hidden.
const DATA_GAPS = ["non-top-account transfers", "buy/sell direction", "wallet labels"];

type Transfer = {
  signature: string;
  amount: number;
  pct_of_supply: number;
  whale: boolean;
  from: string;
  to: string;
  time: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round6(n: number): number {
  return Math.round(n * 1000000) / 1000000;
}

// GET /api/insights/whale-pulse?token=<mint>
// Devnet path: direct Solana RPC only. The mint address is NOT in a transfer
// instruction's accounts, so transfers are found via the mint's top token
// accounts: largest accounts -> recent signatures -> parsed transfers.
export async function whalePulse(mint: string) {
  const pubkey = new PublicKey(mint); // throws on malformed mint; route maps it to 400
  return cached(`whale:${mint}`, TTL_MS, async () => {
    const conn = getConnection();
    const info = await conn.getParsedAccountInfo(pubkey);
    const parsed: any = (info.value?.data as any)?.parsed?.info;
    if (!parsed || parsed.supply === undefined) throw new Error("Not a token mint");
    const decimals: number = parsed.decimals ?? 0;
    const supplyUi = Number(parsed.supply ?? 0) / 10 ** decimals;

    const largest = await conn.getTokenLargestAccounts(pubkey);
    const topAccounts: string[] = (largest.value ?? [])
      .slice(0, TOP_ACCOUNTS)
      .map((a: any) => a.address.toString());
    const topSet = new Set(topAccounts);

    const cutoff = Math.floor(Date.now() / 1000) - WINDOW_MS / 1000;
    // Newest-first across all top accounts, capped: hot accounts (e.g. the
    // faucet) can have hundreds of in-window signatures, and parsing them
    // all sequentially timed out the first smoke test (>100s). Cap + batch.
    const bySig = new Map<string, number>();
    for (const addr of topAccounts) {
      const sigs = await conn.getSignaturesForAddress(new PublicKey(addr), { limit: SIG_LIMIT });
      for (const s of sigs) {
        if (s.blockTime !== null && s.blockTime !== undefined && s.blockTime >= cutoff) {
          if (!bySig.has(s.signature)) bySig.set(s.signature, s.blockTime);
        }
      }
    }
    const sigsToParse = [...bySig.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_PARSED)
      .map(([sig]) => sig);

    async function parseSig(sig: string): Promise<Transfer[]> {
      let tx: any = null;
      try {
        tx = await conn.getParsedTransaction(sig, {
          commitment: "finalized",
          maxSupportedTransactionVersion: 0,
        });
      } catch {
        return []; // skip unparseable transactions; never fail the whole call for one tx
      }
      if (!tx || !tx.meta || tx.meta.err) return [];
      const instructions: any[] = [
        ...(tx.transaction.message.instructions ?? []),
        ...(tx.meta.innerInstructions ?? []).flatMap((g: any) => g.instructions ?? []),
      ];
      const out: Transfer[] = [];
      for (const ix of instructions) {
        const p = ix.parsed;
        if (!p || !p.info) continue;
        if (p.type !== "transfer" && p.type !== "transferChecked") continue;
        const inf = p.info;
        // Plain transfer has no mint field; it belongs to this mint when its
        // source or destination is one of this mint's top accounts.
        if (inf.mint && inf.mint !== mint) continue;
        if (!inf.mint && !topSet.has(inf.source) && !topSet.has(inf.destination)) continue;
        const amount =
          inf.tokenAmount?.uiAmount ?? Number(inf.amount ?? 0) / 10 ** decimals;
        if (!(amount > 0)) continue;
        const pct = supplyUi > 0 ? (amount / supplyUi) * 100 : 0;
        out.push({
          signature: sig,
          amount: round6(amount),
          pct_of_supply: round2(pct),
          whale: pct >= WHALE_PCT,
          from: inf.source,
          to: inf.destination,
          time: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : "",
        });
      }
      return out;
    }

    const transfers: Transfer[] = [];
    for (let i = 0; i < sigsToParse.length; i += BATCH) {
      const chunk = sigsToParse.slice(i, i + BATCH);
      const results = await Promise.all(chunk.map(parseSig));
      for (const r of results) transfers.push(...r);
    }

    transfers.sort((a, b) => b.amount - a.amount); // same order as unrounded pct (supply is constant)
    const listed = transfers.slice(0, MAX_TRANSFERS);
    const whaleCount = transfers.filter((t) => t.whale).length;
    return {
      token: mint,
      window_hours: 24,
      transfers: listed,
      summary: {
        transfer_count: transfers.length,
        whale_transfer_count: whaleCount,
        largest_transfer_pct: transfers.length > 0 ? transfers[0].pct_of_supply : 0,
      },
      coverage: "top-20 token accounts",
      data_gaps: DATA_GAPS,
      sources: ["solana-rpc-devnet"],
      as_of: new Date().toISOString(),
    };
  });
}

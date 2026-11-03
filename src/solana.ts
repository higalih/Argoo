import { Connection } from "@solana/web3.js";
import { config } from "./config";

let conn: Connection | null = null;

export function getConnection(): Connection {
  if (!conn) conn = new Connection(config.rpcUrl, "finalized");
  return conn;
}

// True only if the given transaction actually moved >= fee USDC into the
// treasury wallet. Compares post-minus-pre balances so a treasury that
// already held USDC cannot be tricked by an unrelated transaction.
// Any error (bad signature, unknown tx, RPC failure) => not paid.
// On success also returns the payer (owner of the non-treasury account
// whose balance fell by at least the fee, else the tx fee payer) and the
// treasury delta in USDC, so the metrics endpoint can count unique
// payers and real volume without another RPC call.
export type PaymentVerification =
  | { paid: true; payer: string; amount: number }
  | { paid: false };
// Payer = owner of a non-treasury account, same mint, whose balance fell
// by at least the fee. Null when no such account exists.
function findPayer(tx: any, feeUnits: number): string | null {
  for (const post of tx.meta?.postTokenBalances ?? []) {
    if (post.owner === config.treasury || post.mint !== config.usdcMint) continue;
    const pre = (tx.meta?.preTokenBalances ?? []).find((p: any) => p.accountIndex === post.accountIndex);
    const delta = Number(post.uiTokenAmount.amount) - Number(pre?.uiTokenAmount.amount ?? 0);
    if (delta <= -feeUnits) return post.owner;
  }
  return null;
}
// Fee payer = first account key. For a plain Phantom send this is the
// sender, so it is a sound fallback when no balance-fall match exists.
function feePayer(tx: any): string {
  const keys = tx.transaction?.message?.accountKeys ?? [];
  const first = keys[0];
  return typeof first?.toBase58 === "function" ? first.toBase58() : String(first ?? "unknown");
}
export async function verifyUsdcPayment(signature: string): Promise<PaymentVerification> {
  try {
    const tx = await getConnection().getTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || !tx.meta || tx.meta.err) return { paid: false };
    const feeUnits = Math.round(config.feeUsdc * 1_000_000); // USDC has 6 decimals
    for (const post of tx.meta.postTokenBalances ?? []) {
      if (post.owner === config.treasury && post.mint === config.usdcMint) {
        const postAmount = Number(post.uiTokenAmount.amount);
        const pre = (tx.meta.preTokenBalances ?? []).find(
          (p) => p.accountIndex === post.accountIndex,
        );
        const preAmount = Number(pre?.uiTokenAmount.amount ?? 0);
        const delta = postAmount - preAmount;
        if (delta >= feeUnits) {
          const payer = findPayer(tx, feeUnits) ?? feePayer(tx);
          return { paid: true, payer, amount: delta / 1_000_000 };
        }
      }
    }
    return { paid: false };
  } catch {
    return { paid: false };
  }
}

import { Connection } from "@solana/web3.js";
import { config } from "./config";

let conn: Connection | null = null;

function getConnection(): Connection {
  if (!conn) conn = new Connection(config.rpcUrl, "finalized");
  return conn;
}

// True only if the given transaction actually moved >= fee USDC into the
// treasury wallet. Compares post-minus-pre balances so a treasury that
// already held USDC cannot be tricked by an unrelated transaction.
// Any error (bad signature, unknown tx, RPC failure) => false.
export async function verifyUsdcPayment(signature: string): Promise<boolean> {
  try {
    const tx = await getConnection().getTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || !tx.meta || tx.meta.err) return false;
    const feeUnits = Math.round(config.feeUsdc * 1_000_000); // USDC has 6 decimals
    for (const post of tx.meta.postTokenBalances ?? []) {
      if (post.owner === config.treasury && post.mint === config.usdcMint) {
        const postAmount = Number(post.uiTokenAmount.amount);
        const pre = (tx.meta.preTokenBalances ?? []).find(
          (p) => p.accountIndex === post.accountIndex,
        );
        const preAmount = Number(pre?.uiTokenAmount.amount ?? 0);
        if (postAmount - preAmount >= feeUnits) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

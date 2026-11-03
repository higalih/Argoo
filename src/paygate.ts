import type { IncomingMessage } from "http";
import { verifyUsdcPayment } from "./solana";
import { config } from "./config";

// One signature pays for exactly one call. Seen signatures are rejected
// (replay protection). In-memory only: resets on restart. A persistent
// store is a later task, not a slice-1 problem.
const seen = new Set<string>();

export type GateResult = { ok: true; payer: string; amount: number } | { ok: false; status: number; body: unknown };

export async function checkPayment(req: IncomingMessage): Promise<GateResult> {
  const sig = req.headers["x-signature"];
  if (typeof sig !== "string" || sig.length === 0) {
    return {
      ok: false,
      status: 402,
      body: { error: "Payment Required: send a Solana USDC transaction signature in the X-Signature header." },
    };
  }
  if (!config.treasury) {
    return {
      ok: false,
      status: 402,
      body: { error: "Payment Required: treasury wallet is not configured on this server." },
    };
  }
  if (seen.has(sig)) {
    return {
      ok: false,
      status: 402,
      body: { error: "Payment Required: this signature was already used." },
    };
  }
  const verified = await verifyUsdcPayment(sig);
  if (!verified.paid) {
    return {
      ok: false,
      status: 402,
      body: { error: "Payment Required: no verified USDC payment found for this signature." },
    };
  }
  seen.add(sig);
  return { ok: true, payer: verified.payer, amount: verified.amount };
}

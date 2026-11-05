// Repo-only example (LOCKED Nov 5): clone + build + run.
//   npm run build && node examples/sdk-example.mjs [mint]
// Env (.env, devnet-only, never mainnet, never commit — .env is gitignored):
//   SOLANA_RPC_URL (optional; public devnet RPC may throttle, Helius recommended)
//   TREASURY_ADDRESS (optional; defaults to the live treasury)
//   USDC_MINT (optional; defaults to devnet USDC)
//   FEE_USDC (optional; defaults to 0.05)
//   SDK_PAYER_SECRET_KEY (REQUIRED, base58 secret key (64 bytes, as exported
//     by Phantom) of a DEVNET-ONLY wallet)
// Faucet devnet USDC + SOL first (USDC to pay, SOL for tx fees), or the
// payment fails. Never a mainnet key. In production use a wallet adapter,
// not a raw secret in env.
// Payment confirmation waits for "finalized" (the gate verifies finalized),
// so expect a wait on devnet — the script logs progress, it is not stuck.
// CJS users: const sdk = require("../dist/sdk.js");
//   then sdk.token_safety(mint, opts) etc.
import "dotenv/config";
import sdk from "../dist/sdk.js";
import web3 from "@solana/web3.js";

const { Keypair } = web3;

const mint = process.argv[2] ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const secret = process.env.SDK_PAYER_SECRET_KEY;
if (!secret) {
  console.error("Set SDK_PAYER_SECRET_KEY in .env (devnet-only wallet, never mainnet, never commit).");
  process.exit(1);
}
const wallet = Keypair.fromSecretKey(sdk.secretKeyFromBase58(secret));
const opts = {
  rpcUrl: process.env.SOLANA_RPC_URL || undefined,
  treasury: process.env.TREASURY_ADDRESS || undefined,
  usdcMint: process.env.USDC_MINT || undefined,
  feeUsdc: process.env.FEE_USDC ? Number(process.env.FEE_USDC) : undefined,
  wallet,
};
// Undefined options fall back to the SDK defaults (live treasury, devnet
// USDC, 0.05, public RPC) — the SDK uses ?? DEFAULT_*, so undefined is safe.
console.log(`Calling token_safety for ${mint} (paying 0.05 USDC, waiting for finalized)...`);
const result = await sdk.token_safety(mint, opts);
console.log(JSON.stringify(result, null, 2));

// Malformed mint → fails FREE (validate-before-pay: no fetch, no payment,
// no signature spent). Acceptance #5 + #7 demo.
try {
  await sdk.token_safety("not-a-mint", opts);
  console.log("Malformed call unexpectedly succeeded (should have thrown).");
} catch (e) {
  console.log("Malformed (expected, free):", e.message);
}

// Connection keeps the event loop alive — exit explicitly.
process.exit(0);

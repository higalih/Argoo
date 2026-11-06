// SDK 3-tool sweep (Nov 6): the remaining tools after the Nov 5 token_safety
// paid test. One paid call each (0.05 USDC), 0.15 total, devnet only.
//   npm run build && node examples/sdk-sweep.mjs
// Env: same as sdk-example.mjs (SDK_PAYER_SECRET_KEY required, devnet-only).
// Expected: whale_pulse 200; alpha_bundle 200 AVOID (faucet mint is RISKY,
// the absolute veto — never BUY/WAIT for this mint); market_pulse 200.
// A failed call is logged and the sweep continues, so one failure does not
// hide the other two results. Exit code 1 if any call failed.
import "dotenv/config";
import sdk from "../dist/sdk.js";
import web3 from "@solana/web3.js";

const { Keypair } = web3;

const faucetMint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
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

let failures = 0;
async function paid(name, fn) {
  console.log(`\n--- ${name} (paying 0.05 USDC, waiting for finalized)... ---`);
  try {
    const result = await fn();
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    failures += 1;
    console.error(`${name} FAILED:`, e.message);
  }
}

await paid("whale_pulse", () => sdk.whale_pulse(faucetMint, opts));
await paid("alpha_bundle", () => sdk.alpha_bundle(faucetMint, opts));
await paid("market_pulse", () => sdk.market_pulse("bitcoin", opts));

console.log(`\nSweep done: ${3 - failures}/3 paid calls succeeded.`);
if (failures > 0) console.log("Failures are logged above; a paid call that failed after the gate still spent its signature (gate-first design).");

// Connection keeps the event loop alive — exit explicitly.
process.exit(failures > 0 ? 1 : 0);

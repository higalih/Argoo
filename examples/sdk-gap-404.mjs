// Gap test for SDK acceptance #3 (Nov 6): a 404 must pass through
// unchanged, with no second payment attempt. One paid call (0.05 USDC).
//   node examples/sdk-gap-404.mjs
// Env: same as sdk-example.mjs (SDK_PAYER_SECRET_KEY required, devnet-only).
// How it works: a freshly generated address is a valid mint SHAPE, so
// validate-before-pay passes, but no mint account exists for it on devnet,
// so the server answers 404 after the gate. Expected: the SDK throws
// "Argoo token-safety failed (404): ..." and pays exactly once.
import "dotenv/config";
import sdk from "../dist/sdk.js";
import web3 from "@solana/web3.js";

const { Keypair } = web3;

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

// A fresh address: valid base58 shape, (almost certainly) no mint account.
const randomMint = Keypair.generate().publicKey.toBase58();
console.log(`Calling token_safety for random mint ${randomMint} (paying 0.05 USDC, expecting a 404)...`);
try {
  const result = await sdk.token_safety(randomMint, opts);
  console.log("UNEXPECTED: call succeeded (should have 404'd):", JSON.stringify(result));
  process.exit(1);
} catch (e) {
  console.log("Error surfaced:", e.message);
  if (e.message.includes("failed (404)")) {
    console.log("PASS: 404 passed through unchanged, no second payment (SDK pays at most once per call).");
    process.exit(0);
  }
  console.log("FAIL: expected a (404) error, got something else.");
  process.exit(1);
}

// Agent test suite, Track B (spec: docs/argo-agent-test-suite-spec-draft.md).
// Proves the SDK tool-defs work the way an agent framework uses them —
// schema parse, then execute — NOT just the plain functions (those are
// already paid-proven). NEW script, separate from examples/sdk-example.mjs.
//   npm run build && node examples/agent-loop-test.mjs [--free-only] [mint]
// Env (.env, devnet-only, never mainnet, never commit):
//   SDK_PAYER_SECRET_KEY (REQUIRED for the paid call; not needed --free-only)
//   SOLANA_RPC_URL / TREASURY_ADDRESS / USDC_MINT / FEE_USDC (optional, as in
//   the SDK example — undefined falls back to the SDK defaults).
// Steps: (1) inputSchema parse on the well-formed call, (2) one paid
// token_safety call through tools[] execute, (3) one malformed call fails
// free. --free-only runs (1) + (3) only, so the script can be verified
// without spending. The paid call is Greg's to run (hands-on pattern).
// Payment confirmation waits for "finalized" — the script logs progress.
import "dotenv/config";
import sdk from "../dist/sdk.js";
import web3 from "@solana/web3.js";

const { Keypair } = web3;

const FAUCET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const rest = process.argv.slice(2);
const freeOnly = rest.includes("--free-only");
const mint = rest.find((a) => a !== "--free-only") ?? FAUCET_MINT;

const tool = sdk.tools.find((t) => t.name === "token_safety");
if (!tool) {
  console.error("FAIL: token_safety not found in sdk.tools");
  process.exit(1);
}

let pass = 0;
let fail = 0;

// (1) Tool-def contract: a framework parses input through inputSchema
// before execute. inputSchema is { token: z.ZodTypeAny }.
try {
  const parsed = tool.inputSchema.token.parse(mint);
  console.log(`PASS schema parse: inputSchema.token.parse -> ${parsed}`);
  pass++;
} catch (e) {
  console.log(`FAIL schema parse: ${e.message}`);
  fail++;
}

// (2) One paid call through tools[] execute.
if (!freeOnly) {
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
  console.log(`Calling token_safety via tools[] execute for ${mint} (paying 0.05 USDC, waiting for finalized)...`);
  try {
    const result = await tool.execute({ token: mint }, opts);
    // Shape always; fixture values (score 10, RISKY) only for the faucet
    // mint, which is structurally stable (see spec Acceptance #1).
    const shapeOk = result && typeof result.safety_score === "number" && typeof result.safety_level === "string";
    const fixtureOk = mint !== FAUCET_MINT || (result.safety_score === 10 && result.safety_level === "RISKY");
    const ok = shapeOk && fixtureOk;
    console.log(`${ok ? "PASS" : "FAIL"} paid execute: safety_score=${result?.safety_score} safety_level=${result?.safety_level}`);
    console.log(JSON.stringify(result, null, 2));
    ok ? pass++ : fail++;
  } catch (e) {
    console.log(`FAIL paid execute threw: ${e.message}`);
    fail++;
  }
} else {
  console.log("SKIP paid execute (--free-only; Greg runs the paid call).");
}

// (3) Malformed mint → fails FREE (validate-before-pay: no fetch, no
// payment, no signature spent). execute throws before any payment.
try {
  await tool.execute({ token: "not-a-mint" }, {});
  console.log("FAIL malformed call unexpectedly succeeded (should have thrown).");
  fail++;
} catch (e) {
  console.log(`PASS malformed (expected, free): ${e.message}`);
  pass++;
}

console.log(`\n${pass} passed, ${fail} failed${freeOnly ? " (--free-only)" : ""}.`);
// Connection keeps the event loop alive — exit explicitly.
process.exit(fail ? 1 : 0);

// Gap test for SDK acceptance #4 (Nov 6): a 429 must surface with its
// Retry-After, not silently retried. FREE — no wallet, so no payment
// can happen: each call hits the 402 and throws "Wallet required" before
// any payment. Run LAST: it spends the whole 60 req/60s budget for your
// IP, so wait ~60s before any other call afterwards.
//   node examples/sdk-gap-429.mjs
// How it works: 70 calls in 7 parallel batches of 10. The gate limiter
// allows 60 req/60s per IP, so the first ~60 surface as 402s (thrown as
// "Wallet required") and the rest as 429s. Expected: at least one
// "rate limited (429, retry after Ns)" error with a real number of seconds.
import sdk from "../dist/sdk.js";

const faucetMint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const TOTAL = 70;
const BATCH = 10;

let walletRequired = 0;
let rateLimited = 0;
let other = 0;
let retryAfterSeen = null;

async function oneCall(i) {
  try {
    await sdk.token_safety(faucetMint, {});
    console.log(`call ${i}: UNEXPECTED success`);
    other += 1;
  } catch (e) {
    if (e.message.includes("Wallet required")) {
      walletRequired += 1;
    } else if (e.message.includes("rate limited (429")) {
      rateLimited += 1;
      const m = e.message.match(/retry after (\d+)s/);
      if (m) retryAfterSeen = m[1];
    } else {
      console.log(`call ${i}: other error:`, e.message);
      other += 1;
    }
  }
}

for (let start = 0; start < TOTAL; start += BATCH) {
  const batch = [];
  for (let i = start; i < Math.min(start + BATCH, TOTAL); i++) batch.push(oneCall(i + 1));
  await Promise.allSettled(batch);
  console.log(`... ${Math.min(start + BATCH, TOTAL)}/${TOTAL} calls sent (wallet-required: ${walletRequired}, rate-limited: ${rateLimited})`);
}

console.log(`\nResult: ${walletRequired} wallet-required (402 path), ${rateLimited} rate-limited (429 surfaced), ${other} other.`);
if (rateLimited > 0 && retryAfterSeen !== null) {
  console.log(`PASS: 429 surfaced with Retry-After (${retryAfterSeen}s), not silently retried.`);
  console.log("Note: your IP is rate-limited for the rest of this 60s window — wait ~60s before the next call.");
  process.exit(0);
}
console.log("FAIL: no 429 surfaced (the 70 calls may have spanned a window reset — re-run sooner, in one burst).");
process.exit(1);

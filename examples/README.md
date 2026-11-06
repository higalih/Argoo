# Argoo SDK examples

Run paid calls through the SDK — one paid call per tool — plus one
malformed call that fails free. Devnet only; no real money moves.

Two scripts, one setup:

- `examples/sdk-example.mjs` — one paid `token_safety` call, then the
  malformed-free demo.
- `examples/sdk-sweep.mjs` — one paid call each for the other three
  tools: `whale_pulse`, `alpha_bundle`, `market_pulse`.

## What you need

- Node 18+ (this repo was built with Node v22).
- A Solana devnet wallet with devnet SOL (fees) and devnet USDC (0.05
  USDC per paid call).
- The repo built: `npm run build`.

## Get devnet funds

- **Devnet SOL:** the Solana faucet at https://faucet.solana.com
  (select devnet, paste your wallet address). Up to ~2 SOL per request;
  rate-limited.
- **Devnet USDC:** Circle's faucet at https://faucet.circle.com
  (select Solana Devnet, paste your wallet address). It sends testnet
  USDC to the devnet USDC mint
  `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` — the same mint the
  SDK uses by default. (Faucet limits change; if a faucet is dry, try
  again later — do not buy test tokens from anyone.)
- In Phantom, switch the wallet to **Devnet** before checking balances,
  and import the USDC mint above if the balance does not show.

## Set up the payer key (devnet only)

The examples pay from a wallet you control. The key comes from `.env` —
never hardcode it, never paste it in chat, never commit it (`.env` is
gitignored).

In the repo root `.env`, add one line (placement does not matter):

```
SDK_PAYER_SECRET_KEY=<base58 secret key of your devnet payer wallet>
```

- The value is the wallet's private key in base58 (Phantom: select the
  account, Export Private Key — it asks for your password).
- **Use a devnet-only payer, never a mainnet key.** Each paid call costs
  0.05 USDC: 0.05 for `sdk-example.mjs`, 0.15 for the sweep, 0.20 for
  the full set of four tools.
- **Pay from a different wallet than the treasury.** The treasury
  (default `CRJvdj3wvZHFN2rFqsUGyAeeJppZv8VCHrBk3Metnirb`) is the
  receiver; paying from the treasury to itself can never verify.
- No spaces around `=`, no quotes, no trailing space.

Optional overrides (all have devnet defaults in the SDK): `SOLANA_RPC_URL`
(public devnet may throttle — a keyed devnet RPC is recommended),
`TREASURY_ADDRESS`, `USDC_MINT`, `FEE_USDC`.

## Run it

From the repo root:

```
npm run build
node examples/sdk-example.mjs
node examples/sdk-sweep.mjs
```

What you should see: each paid call returns HTTP 200 JSON, then the
malformed call prints `Malformed (expected, free): ...` and costs
nothing. Both scripts exit on their own (`process.exit(0)` — the
Solana `Connection` otherwise keeps the event loop alive and the cursor
blinks).

## What each call costs and proves

| Call | Expected |
|---|---|
| `token_safety` on the faucet mint | 200, `safety_score: 10`, `RISKY` (honeypot true, top holder ~60%, mint + freeze authority active) |
| `whale_pulse` on the faucet mint | 200 (74 transfers in 24h on Nov 6; 0 whales on the faucet mint) |
| `alpha_bundle` on the faucet mint | 200, verdict `AVOID` — RISKY is the absolute veto, so do not expect BUY/WAIT for this mint |
| `market_pulse("bitcoin")` | 200 (CoinGecko id, not a mint; price and RSI move — Nov 6 it returned $75,635, -6.09%, RSI 34.37) |
| `token_safety("not-a-mint")` | Fails free before any payment (validate-before-pay) |

Each paid call needs its own fresh payment: one signature pays for one
call, and a spent signature is rejected (`already used`). If a payment
shows as failed in Phantom, check the chain before re-paying — the chain
is the source of truth, never pay twice for one call.

## Defaults (devnet)

- API: `https://argoo.xyz`
- RPC: `https://api.devnet.solana.com`
- USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (devnet faucet mint)
- Treasury: `CRJvdj3wvZHFN2rFqsUGyAeeJppZv8VCHrBk3Metnirb`
- Fee: `0.05` USDC per call, verified with commitment `finalized`
  (a merely-confirmed transaction would be rejected by the gate after
  the money moved).

## Troubleshooting

- `Simulation failed: invalid account data` on the first pay attempt:
  the SDK looks up each wallet's real USDC token account for the mint —
  if your wallet has no USDC token account yet, fund it from a faucet
  first (the faucet send creates the account).
- `429`: the gate rate-limits per IP (60 req/60s). Wait for the
  `Retry-After` header; do not retry in a loop.
- `402 already used`: that signature already paid for a call. Pay fresh.

## Proven runs

- Nov 5, 2026 ~21:23 WIB: `sdk-example.mjs` — token_safety 200 RISKY
  10, malformed free. On-chain: payer 19.8 → 19.75 USDC, treasury
  20.2 → 20.25 USDC.
- Nov 6, 2026 ~13:48 WIB: `sdk-sweep.mjs` — 3/3 paid calls
  (whale_pulse 200, alpha_bundle 200 AVOID, market_pulse 200).
  `/api/stats`: 5 calls, 0.25 volume, 1 payer. On-chain after the
  sweep: payer 19.45, treasury 20.55 USDC.

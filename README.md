# Machine Money

Pay-per-call API for AI agents. An agent pays a small USDC fee on Solana
per call (x402 pattern), the server verifies the payment on-chain, then
returns the data. Own implementation — no code copied from Syra.

## Run

```bash
nvm use 20
npm install
cp .env.example .env   # fill in TREASURY_ADDRESS
npm run build
npm start
```

Devnet by default (no real money). Switch `SOLANA_RPC_URL` / `USDC_MINT`
to mainnet values only when ready.

## Endpoints

- `GET /health` — `{ ok: true }`
- `GET /api/insights/market-pulse?token=bitcoin` — price, 24h change,
  24h volume, 14-day RSI. Requires a Solana USDC payment signature in
  the `X-Signature` header. Returns `402` without a valid payment.
- `GET /api/insights/token-safety?token=<mint>` — safety score + level, holder concentration, authorities. Requires a Solana USDC payment signature in the `X-Signature` header. Returns `402` without a valid payment.
- `GET /api/insights/whale-pulse?token=<mint>` — whale transfers in 24h, whale count, coverage. Requires a Solana USDC payment signature in the `X-Signature` header. Returns `402` without a valid payment.
- `GET /api/insights/alpha-bundle?token=<mint>` — BUY/WAIT/AVOID verdict from safety + whale + momentum. Requires a Solana USDC payment signature in the `X-Signature` header. Returns `402` without a valid payment.

## Layout

- `src/index.ts` — HTTP server + routing + static frontend
- `src/paygate.ts` — 402 gate + replay protection (one signature = one call)
- `src/solana.ts` — on-chain USDC payment verification
- `src/endpoints.ts` — data endpoints (CoinGecko, cached 60s)
- `src/tokenSafety.ts` — safety score + level (Solana RPC, cached 60s)
- `src/whalePulse.ts` — whale transfers 24h (Solana RPC, cached 60s)
- `src/alphaBundle.ts` — BUY/WAIT/AVOID verdict from safety + whale + momentum (cached 60s)
- `src/cache.ts` — tiny TTL cache
- `src/config.ts` — env config
- `src/mcp-server.ts` — MCP wrapper (argoo-mcp, stdio, no payment)
- `public/` — landing page (vanilla HTML/JS)

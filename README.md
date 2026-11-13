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

## MCP server

`argoo-mcp` — the same four tools over MCP (stdio), for agents and MCP
clients. Free and local: it calls the handlers directly, with no payment
gate. The paid path stays the HTTP API above (0.05 USDC per call).

Install from npm (public):

```bash
npx -y argoo-mcp   # stdio, waits on stdin (Ctrl+C to exit)
```

Claude Desktop (`claude_desktop_config.json`) with the npm package:

```json
{
  "mcpServers": {
    "argoo": {
      "command": "npx",
      "args": ["-y", "argoo-mcp"],
      "env": { "SOLANA_RPC_URL": "https://devnet.helius-rpc.com/?api-key=YOUR_KEY" }
    }
  }
}
```

Or install from source (development):

```bash
git clone https://github.com/higalih/Argoo.git
cd Argoo
npm install
npm run build
node dist/mcp-server.js   # stdio, waits on stdin (Ctrl+C to exit)
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "argoo": {
      "command": "node",
      "args": ["/absolute/path/to/Argoo/dist/mcp-server.js"],
      "env": { "SOLANA_RPC_URL": "https://devnet.helius-rpc.com/?api-key=YOUR_KEY" }
    }
  }
}
```

`SOLANA_RPC_URL` is optional — without it the server uses the public
devnet RPC (may throttle); a Helius devnet endpoint is the fast path.
Claude Desktop does not run from the project root, so pass
`SOLANA_RPC_URL` in env explicitly (as above); otherwise it falls back
to the public RPC. MCP Inspector (run from the project root, so `.env`
is found):

```bash
npx @modelcontextprotocol/inspector node dist/mcp-server.js
```

Note: install from npm above for normal use. Clone + build is the development path — the repo is public, so anyone can clone and build it.

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

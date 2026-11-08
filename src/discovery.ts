import { config } from "./config";

// ponytail: discovery is one file, one source of truth. The four paid routes
// are listed once below (ROUTES); both public documents — the x402 manifest
// (GET /.well-known/x402) and the OpenAPI document (GET /openapi.json) —
// are built from that same table, so they cannot drift apart. No new
// dependency, no gate change, no DNS record, no directory submission (v1).
// Devnet only; mainnet is a separate decision. Payment terms (treasury,
// USDC mint, fee) come from config at runtime, so the documents track the
// live server instead of a hardcoded copy.

// Solana devnet, CAIP-2. Verified Nov 8: first 32 chars of the devnet
// genesis hash (EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG).
// NOTE: "solana:devnet" is a Wallet Standard moniker, NOT a CAIP-2 id.
export const NETWORK_CAIP2 = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
export const NETWORK_LABEL = "solana-devnet";

const PAYMENT_HEADER = "X-Signature";
const PUBLIC_ORIGIN = "https://argoo.xyz";

// Honest divergence (spec): Argoo's gate is a custom Solana flow, NOT
// standard x402 v1/v2. The IETF draft envelope (draft-hawkins-x402-dns-
// discovery-03) REQUIRES x402Version, kind and facilitator.baseUrl —
// Argoo has no true value for any of them (it speaks no x402 version,
// and there is no facilitator: the gate verifies the transfer itself).
// So those fields are OMITTED here, never filled with a plausible fake.
// resources[] (OPTIONAL in the draft) is the part that fits, plus a
// plain-language payment block describing the real flow.
const FLOW_NOTE =
  "Argoo's gate is a custom Solana flow, NOT standard x402 v1/v2: there is no facilitator and no accepts[] challenge. " +
  "Pay by sending a plain USDC SPL transfer to the treasury, then retry the same request with the transaction signature in the X-Signature header. " +
  "Argoo's gate verifies the payment on-chain (commitment finalized) and accepts each signature once. " +
  "A paid call that then fails validation (400) or is not found (404) still counts as spent — the gate marks the signature used before the handler runs. " +
  "This manifest follows the IETF draft-hawkins-x402-dns-discovery envelope only where it fits: x402Version, kind and facilitator are omitted because Argoo has no true value for them.";

type JsonSchema = Record<string, unknown>;

interface RouteInput {
  name: string;
  required: boolean;
  kind: "coingecko-id" | "solana-mint";
  defaultValue?: string;
  pattern?: string;
  description: string;
}

interface RouteError {
  status: number;
  when: string;
  message: string;
  note?: string;
}

interface PaidRoute {
  id: string;
  schemaName: string;
  path: string;
  summary: string;
  description: string;
  input: RouteInput;
  outputSchema: JsonSchema;
  outputDescription: string;
  errors: RouteError[];
}

// The gate's contract, shared by all four routes (paygate.ts, verified live).
const GATE_ERRORS: RouteError[] = [
  {
    status: 402,
    when: "no X-Signature header, or the signature was already used, or no verified USDC payment was found for it",
    message: "Payment Required: send a Solana USDC transaction signature in the X-Signature header.",
    note: "Other 402 bodies: treasury wallet is not configured; this signature was already used; no verified USDC payment found for this signature.",
  },
  {
    status: 429,
    when: "more than 60 requests in 60s from one IP across /api/insights/*",
    message: "Too many requests: slow down and retry shortly.",
    note: "Response carries a Retry-After header (seconds).",
  },
];

// Mint routes share these 400/404s (index.ts + tokenSafety.ts/whalePulse.ts,
// messages verified live). All three come AFTER a successful payment
// (gate-first), so the payment is consumed by design.
const MINT_ERRORS: RouteError[] = [
  {
    status: 400,
    when: "?token= is missing",
    message: "Missing token: pass a Solana mint address as ?token=.",
    note: "Returned after a successful payment (gate-first) — the payment is consumed.",
  },
  {
    status: 400,
    when: "?token= is not a valid Solana mint address",
    message: "Invalid token mint: expected a Solana mint address.",
    note: "Returned after a successful payment (gate-first) — the payment is consumed.",
  },
  {
    status: 404,
    when: "no account exists for this mint address on devnet",
    message: "Token not found on devnet: no account for this mint address.",
    note: "Returned after a successful payment (gate-first) — the payment is consumed.",
  },
];

const MARKET_ERRORS: RouteError[] = [
  {
    status: 400,
    when: "?token= is not a valid CoinGecko id",
    message: "Invalid token id: expected a CoinGecko id (lowercase letters, digits, hyphens).",
    note: "Returned after a successful payment (gate-first) — the payment is consumed.",
  },
  {
    status: 404,
    when: "CoinGecko has no such id",
    message: "Unknown token: {id}",
    note: "Returned after a successful payment (gate-first) — the payment is consumed.",
  },
];

// Output schemas, copied from the four tool specs (not retyped from memory):
// market_pulse from src/endpoints.ts; token_safety, whale_pulse and
// alpha_bundle from their spec drafts. Every key is always present in the
// live 200 body (nullable fields carry null, never a missing key).
const MARKET_PULSE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["token", "price_usd", "change_24h_pct", "volume_24h_usd", "rsi_14d", "as_of"],
  properties: {
    token: { type: "string", description: "CoinGecko id, lowercased (e.g. bitcoin)." },
    price_usd: { type: "number", description: "Current price in USD." },
    change_24h_pct: { type: ["number", "null"], description: "24h price change in percent, or null when CoinGecko has no value." },
    volume_24h_usd: { type: ["number", "null"], description: "24h trading volume in USD, or null when CoinGecko has no value." },
    rsi_14d: { type: ["number", "null"], description: "RSI (14d) from daily closes, or null with too little history." },
    as_of: { type: "string", format: "date-time" },
  },
};

const TOKEN_SAFETY_SCHEMA: JsonSchema = {
  type: "object",
  required: ["token", "safety_score", "safety_level", "checks", "data_gaps", "sources", "as_of"],
  properties: {
    token: { type: "string", description: "Solana mint address." },
    safety_score: { type: "integer", minimum: 0, maximum: 100 },
    safety_level: { type: "string", enum: ["SAFE", "CAUTION", "RISKY"] },
    checks: {
      type: "object",
      required: ["honeypot", "holder_concentration", "lp_locked", "dev_hold", "mint_authority", "freeze_authority", "metadata_mutable"],
      properties: {
        honeypot: { type: "boolean", description: "Authority-based sell-block signal: true when the freeze authority is active." },
        holder_concentration: {
          type: "object",
          required: ["top_holder_pct", "top10_pct"],
          properties: {
            top_holder_pct: { type: "number" },
            top10_pct: { type: "number" },
          },
        },
        lp_locked: { type: "string", description: "\"unavailable\" on devnet (no pool discovery via direct RPC)." },
        dev_hold: { type: "string", description: "\"unavailable\" on devnet." },
        mint_authority: { type: "string", enum: ["revoked", "active"] },
        freeze_authority: { type: "string", enum: ["revoked", "active"] },
        metadata_mutable: { type: "string", description: "\"unavailable\" on devnet." },
      },
    },
    data_gaps: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "string" } },
    as_of: { type: "string", format: "date-time" },
  },
};

const WHALE_PULSE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["token", "window_hours", "transfers", "summary", "coverage", "data_gaps", "sources", "as_of"],
  properties: {
    token: { type: "string", description: "Solana mint address." },
    window_hours: { type: "integer", description: "Lookback window in hours (24)." },
    transfers: {
      type: "array",
      items: {
        type: "object",
        required: ["signature", "amount", "pct_of_supply", "whale", "from", "to", "time"],
        properties: {
          signature: { type: "string" },
          amount: { type: "number", description: "Human-readable amount (decimals applied)." },
          pct_of_supply: { type: "number", description: "Share of current supply, in percent (approximation against supply now)." },
          whale: { type: "boolean", description: "True when pct_of_supply is at least 1%." },
          from: { type: "string", description: "Source wallet (public ledger address)." },
          to: { type: "string", description: "Destination wallet (public ledger address)." },
          time: { type: "string", format: "date-time" },
        },
      },
    },
    summary: {
      type: "object",
      required: ["transfer_count", "whale_transfer_count", "largest_transfer_pct"],
      properties: {
        transfer_count: { type: "integer" },
        whale_transfer_count: { type: "integer" },
        largest_transfer_pct: { type: "number" },
      },
    },
    coverage: { type: "string", description: "Top-20 token accounts only." },
    data_gaps: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "string" } },
    as_of: { type: "string", format: "date-time" },
  },
};

const ALPHA_BUNDLE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["token", "verdict", "reasons", "inputs", "data_gaps", "sources", "as_of"],
  properties: {
    token: { type: "string", description: "Solana mint address." },
    verdict: { type: "string", enum: ["BUY", "WAIT", "AVOID"] },
    reasons: { type: "array", items: { type: "string" }, description: "Each reason names the input that produced it." },
    inputs: {
      type: "object",
      required: ["momentum", "safety", "whale"],
      properties: {
        momentum: {
          type: ["object", "null"],
          required: ["rsi_14d", "change_24h_pct"],
          properties: {
            rsi_14d: { type: ["number", "null"] },
            change_24h_pct: { type: ["number", "null"] },
          },
          description: "Null when momentum is missing (mint inputs: market_pulse takes CoinGecko ids, not mints).",
        },
        safety: {
          type: ["object", "null"],
          required: ["safety_score", "safety_level"],
          properties: {
            safety_score: { type: "integer" },
            safety_level: { type: "string", enum: ["SAFE", "CAUTION", "RISKY"] },
          },
        },
        whale: {
          type: ["object", "null"],
          required: ["transfer_count_24h", "whale_transfer_count", "largest_transfer_pct"],
          properties: {
            transfer_count_24h: { type: "integer" },
            whale_transfer_count: { type: "integer" },
            largest_transfer_pct: { type: "number" },
          },
        },
      },
    },
    data_gaps: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "string" } },
    as_of: { type: "string", format: "date-time" },
  },
};

const ERROR_SCHEMA: JsonSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
  },
};

const PUBLIC_STATS_SCHEMA: JsonSchema = {
  type: "object",
  required: ["calls_total", "calls_by_tool", "unique_payers", "volume_usdc", "since"],
  properties: {
    calls_total: { type: "integer" },
    calls_by_tool: { type: "object", additionalProperties: { type: "integer" } },
    unique_payers: { type: "integer", description: "Count only — no addresses are ever published." },
    volume_usdc: { type: "number" },
    since: { type: "string", format: "date-time", description: "Start of the current in-memory window (resets on server restart)." },
  },
};

// The single source of truth: one entry per paid route.
const ROUTES: PaidRoute[] = [
  {
    id: "market_pulse",
    schemaName: "MarketPulse",
    path: "/api/insights/market-pulse",
    summary: "Market pulse (price, 24h change, volume, RSI 14d)",
    description: "Market pulse: price, 24h change, 24h volume and RSI 14d for a CoinGecko id. Costs 0.05 USDC per call.",
    input: {
      name: "token",
      required: false,
      kind: "coingecko-id",
      defaultValue: "bitcoin",
      pattern: "^[a-z0-9-]+$",
      description: "CoinGecko id (lowercase letters, digits, hyphens), e.g. bitcoin. Optional — defaults to bitcoin.",
    },
    outputSchema: MARKET_PULSE_SCHEMA,
    outputDescription: "Market pulse for the requested CoinGecko id.",
    errors: [...MARKET_ERRORS, ...GATE_ERRORS],
  },
  {
    id: "token_safety",
    schemaName: "TokenSafety",
    path: "/api/insights/token-safety",
    summary: "Token safety (checks + score + level)",
    description: "Safety checks + a safety score and level for a Solana mint. No trade verdict — that belongs to alpha_bundle. Costs 0.05 USDC per call.",
    input: {
      name: "token",
      required: true,
      kind: "solana-mint",
      description: "Solana mint address (base58). Required.",
    },
    outputSchema: TOKEN_SAFETY_SCHEMA,
    outputDescription: "Safety checks, score and level for the requested mint.",
    errors: [...MINT_ERRORS, ...GATE_ERRORS],
  },
  {
    id: "whale_pulse",
    schemaName: "WhalePulse",
    path: "/api/insights/whale-pulse",
    summary: "Whale pulse (recent large transfers)",
    description: "Recent large transfers (24h) + a summary for a Solana mint. Data only — no trade verdict, no buy/sell labels. Costs 0.05 USDC per call.",
    input: {
      name: "token",
      required: true,
      kind: "solana-mint",
      description: "Solana mint address (base58). Required.",
    },
    outputSchema: WHALE_PULSE_SCHEMA,
    outputDescription: "Whale activity (24h) for the requested mint.",
    errors: [...MINT_ERRORS, ...GATE_ERRORS],
  },
  {
    id: "alpha_bundle",
    schemaName: "AlphaBundle",
    path: "/api/insights/alpha-bundle",
    summary: "Alpha bundle (BUY / WAIT / AVOID verdict)",
    description: "BUY / WAIT / AVOID verdict combining momentum, safety and whale activity for a Solana mint. Verdict-only in v1 (no bundle score). Costs 0.05 USDC per call.",
    input: {
      name: "token",
      required: true,
      kind: "solana-mint",
      description: "Solana mint address (base58). Required.",
    },
    outputSchema: ALPHA_BUNDLE_SCHEMA,
    outputDescription: "Verdict, reasons and inputs for the requested mint.",
    errors: [...MINT_ERRORS, ...GATE_ERRORS],
  },
];

function paymentTerms(): Record<string, unknown> {
  return {
    flow: "custom-solana-transfer",
    network: NETWORK_LABEL,
    networkCaip2: NETWORK_CAIP2,
    asset: "USDC",
    assetMint: config.usdcMint,
    payTo: config.treasury,
    amountUsdc: config.feeUsdc,
    amountMicroUsdc: Math.round(config.feeUsdc * 1_000_000),
    decimals: 6,
    header: PAYMENT_HEADER,
    commitment: "finalized",
    note: FLOW_NOTE,
  };
}

export function buildManifest(): Record<string, unknown> {
  const payment = paymentTerms();
  return {
    name: "Argoo",
    description: "Market intel for AI agents. Pay per call in USDC on Solana devnet.",
    note: FLOW_NOTE,
    network: NETWORK_CAIP2,
    payment,
    resources: ROUTES.map((r) => ({
      resource: PUBLIC_ORIGIN + r.path,
      method: "GET",
      description: r.description,
      price: { amount: String(config.feeUsdc), asset: "USDC", decimals: 6 },
      payTo: config.treasury,
      header: PAYMENT_HEADER,
      input: {
        query: {
          name: r.input.name,
          required: r.input.required,
          ...(r.input.defaultValue !== undefined ? { default: r.input.defaultValue } : {}),
          ...(r.input.pattern ? { pattern: r.input.pattern } : {}),
          description: r.input.description,
        },
      },
      output: r.outputSchema,
      errors: r.errors.map((e) => ({
        status: e.status,
        when: e.when,
        message: e.message,
        ...(e.note ? { note: e.note } : {}),
      })),
    })),
  };
}

export function buildOpenApi(): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const r of ROUTES) {
    const paramSchema: Record<string, unknown> = { type: "string" };
    if (r.input.pattern) paramSchema.pattern = r.input.pattern;
    if (r.input.defaultValue !== undefined) paramSchema.default = r.input.defaultValue;
    paths[r.path] = {
      get: {
        summary: r.summary,
        description: r.description,
        parameters: [
          {
            name: r.input.name,
            in: "query",
            required: r.input.required,
            description: r.input.description,
            schema: paramSchema,
          },
        ],
        responses: {
          "200": {
            description: r.outputDescription,
            content: { "application/json": { schema: { $ref: "#/components/schemas/" + r.schemaName } } },
          },
          "400": {
            description: "Malformed input. Returned after a successful payment (gate-first) — the payment is consumed.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "402": {
            description: "Payment required — no signature, spent signature, or no verified USDC payment.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Unknown token or mint. Returned after a successful payment (gate-first) — the payment is consumed.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "429": {
            description: "Rate limited — per-IP 60 req/60s. The Retry-After header carries the wait.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
        // Vendor extension name LOCKED Nov 8: x-argoo-payment (namespaced to
        // Argoo, so it cannot collide with any x402 v2 field).
        "x-argoo-payment": {
          type: "solana-transfer",
          network: "devnet",
          mint: config.usdcMint,
          treasury: config.treasury,
          header: PAYMENT_HEADER,
        },
      },
    };
  }
  // The free public route is documented in the same file (spec), so the
  // document is a complete picture of the API.
  paths["/api/stats"] = {
    get: {
      summary: "Public usage metrics",
      description: "Counts only — no addresses. Free, no signature. In-memory: resets when the server restarts.",
      responses: {
        "200": {
          description: "Calls, payers and volume since the last restart.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/PublicStats" } } },
        },
        "429": {
          description: "Rate limited — /api/stats shares the 60 req/60s per-IP limiter.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "Argoo",
      version: "0.1.0",
      description:
        "Market intel for AI agents. Pay per call in USDC on Solana devnet. " +
        "Payment is a custom Solana flow (see x-argoo-payment on each operation), NOT standard x402 v1/v2.",
    },
    servers: [{ url: PUBLIC_ORIGIN, description: "Live on Solana devnet" }],
    paths,
    components: {
      schemas: {
        MarketPulse: MARKET_PULSE_SCHEMA,
        TokenSafety: TOKEN_SAFETY_SCHEMA,
        WhalePulse: WHALE_PULSE_SCHEMA,
        AlphaBundle: ALPHA_BUNDLE_SCHEMA,
        Error: ERROR_SCHEMA,
        PublicStats: PUBLIC_STATS_SCHEMA,
      },
    },
  };
}

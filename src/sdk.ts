// ponytail: thin SDK wrapper for Argoo's paid HTTP API.
// Decision (LOCKED Nov 5): option (A) — SDK wraps the paid HTTP API,
// MCP stays the free trial funnel (not a second free SDK).
// No new dependencies: @solana/web3.js + zod only (both already installed).
// No @solana/spl-token installed, so the USDC transfer is hand-rolled below
// (standard SPL Transfer layout, web3.js only). No dotenv import: this is a
// library — the caller passes options (or loads env itself, see example).
// No console.* here: a library throws, the caller decides how to log.

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { z } from "zod";

// Well-known SPL program IDs (public constants, same on all clusters).
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

// Defaults mirror the live server (argoo.xyz, devnet). Override via options.
// Treasury default is the live treasury (Account1, from the server's .env);
// if you run your own server with a different treasury, pass treasury explicitly.
export const DEFAULT_BASE_URL = "https://argoo.xyz";
export const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
export const DEFAULT_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const DEFAULT_TREASURY = "CRJvdj3wvZHFN2rFqsUGyAeeJppZv8VCHrBk3Metnirb";
export const DEFAULT_FEE_USDC = 0.05;

export interface ArgooOptions {
  baseUrl?: string;
  rpcUrl?: string;
  treasury?: string;
  usdcMint?: string;
  feeUsdc?: number;
  wallet?: Keypair; // required for paid calls (not for validation failures)
}

// Validate-before-pay (shape-only, client-side, LOCKED Nov 5).
// Mint: must parse as a PublicKey. Id: must match the server's exact regex.
// Errors mirror the server's 400 messages, so SDK errors match HTTP errors.
const COINGECKO_ID_RE = /^[a-z0-9-]+$/;

function validateMint(token: string | undefined): string {
  if (!token) throw new Error("Missing token: pass a Solana mint address as ?token=.");
  try {
    new PublicKey(token);
  } catch {
    throw new Error("Invalid token mint: expected a Solana mint address.");
  }
  return token;
}

function validateId(token: string | undefined): string {
  const id = token ?? "bitcoin";
  if (!COINGECKO_ID_RE.test(id)) {
    throw new Error("Invalid token id: expected a CoinGecko id (lowercase letters, digits, hyphens).");
  }
  return id;
}

// Base58 decode (hand-rolled, no new dep) so Phantom base58 secret keys work
// without adding bs58. In production use a wallet adapter, not a raw secret.
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function secretKeyFromBase58(secret: string): Uint8Array {
  if (!secret) throw new Error("Missing secret key.");
  let n = 0n;
  for (const c of secret) {
    const i = BASE58_ALPHABET.indexOf(c);
    if (i < 0) throw new Error("Invalid base58 character in secret key.");
    n = n * 58n + BigInt(i);
  }
  // Leading '1's are leading zero bytes (BigInt drops them, so count them).
  let leading = 0;
  for (const c of secret) {
    if (c !== "1") break;
    leading += 1;
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  const totalLength = leading + bytes.length;
  if (totalLength !== 64) {
    throw new Error(`Invalid secret key length (expected 64 bytes, got ${totalLength}).`);
  }
  const out = new Uint8Array(64);
  out.set(bytes, leading);
  return out;
}

// Find the wallet's actual token account for a mint (via
// getParsedTokenAccountsByOwner). Do NOT assume the associated token account:
// the live wallets hold USDC in non-ATA token accounts, and the derived ATA
// addresses don't exist on-chain (paid-test failure, Nov 5: InvalidAccountData
// on both derived ATAs). Returns the first account holding at least minAmount
// (micro units), or throws a clear error. ATA creation is a later addition.
async function findTokenAccount(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  minAmount: number,
): Promise<PublicKey> {
  const { value } = await connection.getParsedTokenAccountsByOwner(owner, { mint });
  for (const { pubkey, account } of value) {
    const amount = Number(account.data.parsed.info.tokenAmount.amount);
    if (amount >= minAmount) return pubkey;
  }
  throw new Error(
    `No USDC token account for ${owner.toBase58()} with at least ${minAmount / 1_000_000} USDC (mint ${mint.toBase58()}).`,
  );
}

// Pay feeUsdc USDC (devnet) from wallet to treasury. Returns the signature.
// Hand-rolled SPL Transfer (instruction 3, amount u64 LE, accounts source /
// destination / owner). Waits for "finalized" — the gate verifies with
// commitment "finalized", so a merely-confirmed tx would 402. Finalized on
// devnet takes a while; callers should expect the wait (see example).
// NOTE: source/destination are the wallets' ACTUAL token accounts for the mint
// (looked up, not assumed ATAs — see findTokenAccount). If a wallet has no
// token account for the mint yet, this throws a clear error instead of
// failing inside the transfer; ATA creation is a later addition, not v1.
// ponytail: web3.js keeps an infinitely-reconnecting WS client alive after
// confirmation, so CLI scripts never exit. Tear it down after each payment.
// Private field - guarded, so a future web3.js change can't break payment.
function teardownWs(connection: Connection): void {
  try {
    const ws = (connection as any)._rpcWebSocket;
    if (!ws) return;
    ws.reconnect = false;
    if (ws.reconnect_timer_id) clearTimeout(ws.reconnect_timer_id);
    ws.close();
  } catch { /* cleanup only */ }
}

async function payUsdc(opts: {
  rpcUrl: string;
  treasury: string;
  usdcMint: string;
  feeUsdc: number;
  wallet: Keypair;
}): Promise<string> {
  const connection = new Connection(opts.rpcUrl, "finalized");
  const owner = opts.wallet.publicKey;
  const mint = new PublicKey(opts.usdcMint);
  const treasury = new PublicKey(opts.treasury);
  const amount = Math.round(opts.feeUsdc * 1_000_000); // USDC has 6 decimals (mirrors solana.ts)
  const source = await findTokenAccount(connection, owner, mint, amount);
  const destination = await findTokenAccount(connection, treasury, mint, 0);
  const data = Buffer.alloc(9);
  data[0] = 3; // SPL Token Transfer
  data.writeBigUInt64LE(BigInt(amount), 1);
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    programId: TOKEN_PROGRAM_ID,
    data,
  });
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash }).add(instruction);
  return await sendAndConfirmTransaction(connection, tx, [opts.wallet], { commitment: "finalized" }).finally(() => teardownWs(connection));
}

function httpError(route: string, res: Response, body: string): Error {
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After") ?? "unknown";
    return new Error(`Argoo ${route} rate limited (429, retry after ${retryAfter}s): ${body}`);
  }
  return new Error(`Argoo ${route} failed (${res.status}): ${body}`);
}

// Core: validate (free) → call (no sig) → if 402, pay once → call with sig.
// At most 2 HTTP calls + 1 payment per SDK call. No auto-retry after paying:
// a 402/400/404/429 on the paid call passes through (no second payment).
async function callPaid(
  route: string,
  token: string | undefined,
  opts: ArgooOptions,
  validate: (t: string | undefined) => string,
): Promise<any> {
  const resolved = validate(token);
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/api/insights/${route}?token=${encodeURIComponent(resolved)}`;
  const first = await fetch(url);
  if (first.status !== 402) {
    if (!first.ok) throw httpError(route, first, await first.text());
    return (await first.json()) as any;
  }
  // 402: gate live, pay once, retry once with the fresh signature.
  if (!opts.wallet) throw new Error("Wallet required to pay: pass wallet in options.");
  const signature = await payUsdc({
    rpcUrl: opts.rpcUrl ?? DEFAULT_RPC_URL,
    treasury: opts.treasury ?? DEFAULT_TREASURY,
    usdcMint: opts.usdcMint ?? DEFAULT_USDC_MINT,
    feeUsdc: opts.feeUsdc ?? DEFAULT_FEE_USDC,
    wallet: opts.wallet,
  });
  const second = await fetch(url, { headers: { "X-Signature": signature } });
  if (!second.ok) throw httpError(route, second, await second.text());
  return (await second.json()) as any;
}

// Plain functions (for scripts). Names match the MCP tools (snake_case);
// routes are the HTTP kebab-case URLs. market_pulse defaults to bitcoin;
// the other three require a mint (validate throws on missing).
export async function market_pulse(token: string | undefined, opts: ArgooOptions = {}): Promise<any> {
  const id = token ?? "bitcoin";
  return callPaid("market-pulse", id, opts, validateId);
}

export async function token_safety(token: string | undefined, opts: ArgooOptions = {}): Promise<any> {
  return callPaid("token-safety", token, opts, validateMint);
}

export async function whale_pulse(token: string | undefined, opts: ArgooOptions = {}): Promise<any> {
  return callPaid("whale-pulse", token, opts, validateMint);
}

export async function alpha_bundle(token: string | undefined, opts: ArgooOptions = {}): Promise<any> {
  return callPaid("alpha-bundle", token, opts, validateMint);
}

// Tool definitions (framework-agnostic, LOCKED Nov 5): name + description +
// zod schema + execute, mirroring the MCP tool schemas/descriptions in
// mcp-server.ts. Schemas are duplicated here (not imported from mcp-server.ts)
// so the SDK does not import a stdio server (side effect on import).
// Adapt to your framework (LangChain tool(), Vercel AI tool(), or a raw agent
// loop that calls execute directly) — no framework plugin in v1.
export interface ArgooTool {
  name: string;
  description: string;
  inputSchema: { token: z.ZodTypeAny };
  execute: (input: { token?: string }, opts: ArgooOptions) => Promise<any>;
}

export const tools: ArgooTool[] = [
  {
    name: "market_pulse",
    description: "Market pulse: harga, 24h change, volume, RSI 14d (devnet slice)",
    inputSchema: { token: z.string().optional().describe("Token id, mis. bitcoin") },
    execute: (input, opts) => market_pulse(input.token, opts),
  },
  {
    name: "token_safety",
    description: "Token safety check: score, level, holder concentration, authorities (devnet slice)",
    inputSchema: { token: z.string().describe("Solana mint address, mis. 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU") },
    execute: (input, opts) => token_safety(input.token, opts),
  },
  {
    name: "whale_pulse",
    description: "Whale pulse: recent large transfers, whale count, coverage (devnet slice)",
    inputSchema: { token: z.string().describe("Solana mint address") },
    execute: (input, opts) => whale_pulse(input.token, opts),
  },
  {
    name: "alpha_bundle",
    description: "Alpha bundle: BUY/WAIT/AVOID verdict + reasons from safety, whale, momentum (devnet slice)",
    inputSchema: { token: z.string().describe("Solana mint address") },
    execute: (input, opts) => alpha_bundle(input.token, opts),
  },
];

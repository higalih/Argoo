import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { config } from "./config";
import { checkPayment } from "./paygate";
import { rateLimitOk } from "./rateLimit";
import { marketPulse } from "./endpoints";
import { tokenSafety } from "./tokenSafety";
import { whalePulse } from "./whalePulse";
import { alphaBundle } from "./alphaBundle";
import { PublicKey } from "@solana/web3.js";

const PUBLIC_DIR = join(__dirname, "..", "public");
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>) {
  res.writeHead(status, { "Content-Type": "application/json", ...extraHeaders });
  res.end(JSON.stringify(body));
}

async function serveStatic(path: string, res: ServerResponse) {
  const file = path === "/" ? "index.html" : path.slice(1);
  if (file.includes("..")) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  try {
    const data = await readFile(join(PUBLIC_DIR, file));
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${config.port}`);
    if (url.pathname.startsWith("/api/insights/")) {
      const limit = rateLimitOk(req);
      if (!limit.ok) {
        sendJson(res, 429, { error: "Too many requests: slow down and retry shortly." }, { "Retry-After": String(limit.retryAfterSec) });
        return;
      }
    }
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/insights/market-pulse") {
      const gate = await checkPayment(req);
      if (!gate.ok) {
        sendJson(res, gate.status, gate.body);
        return;
      }
      const token = url.searchParams.get("token") ?? "bitcoin";
      const data = await marketPulse(token);
      sendJson(res, 200, data);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/insights/token-safety") {
      const gate = await checkPayment(req);
      if (!gate.ok) {
        sendJson(res, gate.status, gate.body);
        return;
      }
      const mint = url.searchParams.get("token") ?? "";
      if (mint.length === 0) {
        sendJson(res, 400, { error: "Missing token: pass a Solana mint address as ?token=." });
        return;
      }
      try {
        new PublicKey(mint);
      } catch {
        sendJson(res, 400, { error: "Invalid token mint: expected a Solana mint address." });
        return;
      }
      const data = await tokenSafety(mint);
      sendJson(res, 200, data);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/insights/whale-pulse") {
      const gate = await checkPayment(req);
      if (!gate.ok) {
        sendJson(res, gate.status, gate.body);
        return;
      }
      const mint = url.searchParams.get("token") ?? "";
      if (mint.length === 0) {
        sendJson(res, 400, { error: "Missing token: pass a Solana mint address as ?token=." });
        return;
      }
      try {
        new PublicKey(mint);
      } catch {
        sendJson(res, 400, { error: "Invalid token mint: expected a Solana mint address." });
        return;
      }
      const data = await whalePulse(mint);
      sendJson(res, 200, data);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/insights/alpha-bundle") {
      const gate = await checkPayment(req);
      if (!gate.ok) {
        sendJson(res, gate.status, gate.body);
        return;
      }
      const mint = url.searchParams.get("token") ?? "";
      if (mint.length === 0) {
        sendJson(res, 400, { error: "Missing token: pass a Solana mint address as ?token=." });
        return;
      }
      try {
        new PublicKey(mint);
      } catch {
        sendJson(res, 400, { error: "Invalid token mint: expected a Solana mint address." });
        return;
      }
      const data = await alphaBundle(mint);
      sendJson(res, 200, data);
      return;
    }
    if (req.method === "GET") {
      await serveStatic(url.pathname, res);
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    // Client-safe errors carry their own status (e.g. 404 for a token that
    // is not a mint). Anything else is a server error: log it, but never
    // echo internal messages to the client (they can include RPC details).
    const status = (err as any)?.status ?? 500;
    if (status === 500) console.error(err);
    sendJson(res, status, { error: status === 500 ? "Internal error" : err instanceof Error ? err.message : "Internal error" });
  }
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`Agent Pay Gate listening on 127.0.0.1:${config.port} (devnet)`);
});

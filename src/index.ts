import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { config } from "./config";
import { checkPayment } from "./paygate";
import { marketPulse } from "./endpoints";

const PUBLIC_DIR = join(__dirname, "..", "public");
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
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
    if (req.method === "GET") {
      await serveStatic(url.pathname, res);
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : "Internal error" });
  }
});

server.listen(config.port, () => {
  console.log(`Agent Pay Gate listening on :${config.port} (devnet)`);
});

import type { IncomingMessage } from "http";

// ponytail: in-memory per-IP fixed-window limiter, no dependency.
// 60 requests per 60s per IP across all /api/insights/* routes.
// IP resolution: CF-Connecting-IP (Cloudflare overwrites it, so it cannot
// be spoofed through the tunnel) else X-Forwarded-For first entry else the
// socket address. Safe here because the server binds loopback only:
// external traffic must come through cloudflared, and direct localhost
// clients are the operator.
// In-memory only: resets on restart, like the cache and the gate seen-set.
// A distributed flood (many distinct IPs) is Cloudflare's layer, not this
// limiter's job — this stops single-IP floods, including no-signature ones.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function clientIp(req: IncomingMessage): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.length > 0) return cf;
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

export function rateLimitOk(
  req: IncomingMessage,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const ip = clientIp(req);
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, b);
  }
  b.count += 1;
  if (b.count > MAX_REQUESTS) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true };
}

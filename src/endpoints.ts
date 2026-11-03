import { cached } from "./cache";
import { config } from "./config";

const TTL_MS = 60_000; // CoinGecko free tier: cache 1 minute per key.

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Upstream ${res.status} for ${url}`);
  return res.json();
}

// Plain RSI, no library. Returns null when there is not enough history.
function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  const avgGain = gain / period;
  const avgLoss = loss / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// GET /api/insights/market-pulse?token=bitcoin
// Real data from CoinGecko (no key). No invented indicators.
export async function marketPulse(token: string) {
  const id = token.toLowerCase().trim();
  if (id.length === 0 || !/^[a-z0-9-]+$/.test(id)) {
    const e = new Error("Invalid token id: expected a CoinGecko id (lowercase letters, digits, hyphens).");
    (e as any).status = 400;
    throw e;
  }
  let price: any;
  let chart: any;
  try {
    [price, chart] = await Promise.all([
      cached(`price:${id}`, TTL_MS, () =>
        getJson(
          `${config.coingeckoBase}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
        ),
      ),
      cached(`chart:${id}`, TTL_MS, () =>
        getJson(`${config.coingeckoBase}/coins/${id}/market_chart?vs_currency=usd&days=15&interval=daily`),
      ),
    ]);
  } catch (err) {
    // CoinGecko 404 means the id is unknown (not a server error): map it
    // to 404. Any other upstream failure stays a 500-generic via the catch.
    if (err instanceof Error && err.message.startsWith("Upstream 404")) {
      const e = new Error(`Unknown token: ${id}`);
      (e as any).status = 404;
      throw e;
    }
    throw err;
  }
  const p = price[id];
  if (!p) {
    const e = new Error(`Unknown token: ${id}`);
    (e as any).status = 404;
    throw e;
  }
  const closes: number[] = (chart.prices ?? []).map((pt: number[]) => pt[1]);
  return {
    token: id,
    price_usd: p.usd,
    change_24h_pct: p.usd_24h_change ?? null,
    volume_24h_usd: p.usd_24h_vol ?? null,
    rsi_14d: rsi(closes),
    as_of: new Date().toISOString(),
  };
}

// Tiny TTL cache. Keeps us inside free-tier rate limits (e.g. CoinGecko)
// without a dependency.
type Entry<T> = { value: T; expiresAt: number };
const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, fetchFn: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() < hit.expiresAt) return hit.value;
  const value = await fetchFn();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

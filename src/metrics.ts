// ponytail: in-memory public metrics, no dependency. Counters reset on
// restart (like the cache, gate seen-set, and limiter); `since` makes
// that honest. Payer addresses are counted, never serialized — the
// response carries counts only, never addresses.
const startedAt = new Date().toISOString();
const callsByTool: Record<string, number> = {
  market_pulse: 0,
  token_safety: 0,
  whale_pulse: 0,
  alpha_bundle: 0,
};
let callsTotal = 0;
let volumeUnits = 0; // integer micro-USDC, avoids float drift
const payers = new Set<string>();

export function recordCall(tool: string, payer: string, amountUsdc: number) {
  callsTotal += 1;
  if (tool in callsByTool) callsByTool[tool] += 1;
  if (payer) payers.add(payer);
  volumeUnits += Math.round(amountUsdc * 1_000_000);
}

export function getStats() {
  return {
    calls_total: callsTotal,
    calls_by_tool: { ...callsByTool },
    unique_payers: payers.size,
    volume_usdc: volumeUnits / 1_000_000,
    since: startedAt,
    as_of: new Date().toISOString(),
  };
}

/** Remembers when a task was served to a worker so latency is measured server-side. */
declare global {
  var __served: Map<string, number> | undefined;
}
const served = globalThis.__served ?? (globalThis.__served = new Map());

export function markServed(wallet: string, taskId: string) {
  const now = Date.now();
  served.set(`${wallet}:${taskId}`, now);
  if (served.size > 5000) {
    for (const [k, v] of served) if (now - v > 3_600_000) served.delete(k);
  }
  return now;
}

export function takeServed(wallet: string, taskId: string): number | null {
  const k = `${wallet}:${taskId}`;
  const v = served.get(k) ?? null;
  served.delete(k);
  return v;
}

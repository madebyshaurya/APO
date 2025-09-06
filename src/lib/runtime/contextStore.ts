// Simple in-memory context store for short-lived canvas summaries
// NOTE: This is an in-process cache; for multi-instance deployments, use a shared cache.

type Entry = { summary: any; ts: number };
const store = new Map<string, Entry>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

function cleanup() {
  const now = Date.now();
  for (const [k, v] of store.entries()) if (now - v.ts > TTL_MS) store.delete(k);
}

export function putContext(id: string, summary: any) {
  store.set(id, { summary, ts: Date.now() });
  cleanup();
}

export function getContext(id?: string | null) {
  if (!id) return null;
  const e = store.get(id);
  if (!e) return null;
  if (Date.now() - e.ts > TTL_MS) {
    store.delete(id);
    return null;
  }
  return e.summary;
}


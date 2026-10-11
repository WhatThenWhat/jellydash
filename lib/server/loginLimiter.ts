// In-memory limiter: 5 failures per username per 15 minutes, plus a global cap of 30 failures per 15 minutes.
// Next route handlers do not expose the peer address, so IP-based limiting is left to the reverse proxy.
const WINDOW_MS = 15 * 60 * 1000;
const PER_USER = 5;
const GLOBAL = 30;

type Entry = { count: number; first: number };
const byUser = new Map<string, Entry>();
let global: Entry = { count: 0, first: 0 };

function live(e: Entry | undefined, nowMs: number): Entry | undefined {
  return e && nowMs - e.first < WINDOW_MS ? e : undefined;
}

export function checkLoginAllowed(username: string, nowMs = Date.now()): boolean {
  const u = live(byUser.get(username.toLowerCase()), nowMs);
  const g = live(global, nowMs);
  return (u?.count ?? 0) < PER_USER && (g?.count ?? 0) < GLOBAL;
}

export function recordLoginFailure(username: string, nowMs = Date.now()): void {
  const key = username.toLowerCase();
  const u = live(byUser.get(key), nowMs) ?? { count: 0, first: nowMs };
  u.count += 1;
  byUser.set(key, u);
  const g = live(global, nowMs) ?? { count: 0, first: nowMs };
  g.count += 1;
  global = g;
  if (byUser.size > 1000) for (const [k, v] of byUser) if (!live(v, nowMs)) byUser.delete(k);
}

export function recordLoginSuccess(username: string): void {
  byUser.delete(username.toLowerCase());
}

export function resetLimiter(): void {
  byUser.clear();
  global = { count: 0, first: 0 };
}

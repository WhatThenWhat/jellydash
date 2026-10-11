import { WatchlistRunner, type RunSummary } from '../core/watchlist.ts';
import { WatchlistStore } from '../core/watchlistStore.ts';
import { getService } from './runtime.ts';

/**
 * Background polling for the Watchlist feature. One timer per process. Only servers with the feature
 * switched on are visited, one at a time, and a server is never visited twice at once.
 */

const MIN_SECONDS = 30;
const MAX_SECONDS = 3600;
const DEFAULT_SECONDS = 60;
const REAPPLY_EVERY_MS = 30 * 60 * 1000;

type State = { started?: boolean; timer?: NodeJS.Timeout; running: Map<string, Promise<RunSummary>>; lastReapply: Map<string, number> };
const g = globalThis as unknown as { __jdWatchlist?: State };

function state(): State {
  return (g.__jdWatchlist ??= { running: new Map(), lastReapply: new Map() });
}

export function pollSeconds(raw = process.env.WATCHLIST_POLL_SECONDS): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_SECONDS;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, n));
}

export function watchlistStore(): WatchlistStore {
  return new WatchlistStore(getService().store.db);
}

/** Run one server now. A run already in progress for that server is reused. */
export function runWatchlist(serverId: string): Promise<RunSummary> {
  const st = state();
  const existing = st.running.get(serverId);
  if (existing) return existing;

  const job = (async () => {
    const svc = getService();
    const ws = watchlistStore();
    try {
      const runner = new WatchlistRunner(svc.clientFor(serverId), ws, serverId);
      const summary = await runner.run();

      const last = st.lastReapply.get(serverId) ?? 0;
      if (Date.now() - last > REAPPLY_EVERY_MS) {
        const r = await runner.reapply();
        st.lastReapply.set(serverId, Date.now());
        for (const f of r.failed) summary.errors.push(`reapply ${f.playlistId}: ${f.error}`);
      }

      const text = `${summary.users} users, +${summary.added} added, -${summary.removed} unfavorited, -${summary.watchedRemoved} watched`;
      ws.saveRun(serverId, summary.errors.length === 0, summary.errors.slice(0, 5).join('; ') || null, text);
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ws.saveRun(serverId, false, message, null);
      throw error;
    } finally {
      st.running.delete(serverId);
    }
  })();
  st.running.set(serverId, job);
  return job;
}

/** Re-apply names and images right away (after settings are saved). */
export async function reapplyWatchlist(serverId: string) {
  const runner = new WatchlistRunner(getService().clientFor(serverId), watchlistStore(), serverId);
  const result = await runner.reapply();
  state().lastReapply.set(serverId, Date.now());
  return result;
}

async function tick(): Promise<void> {
  try {
    for (const serverId of watchlistStore().enabledServerIds()) {
      await runWatchlist(serverId).catch((e) => console.error('[watchlist] run failed:', e instanceof Error ? e.message : e));
    }
  } catch (error) {
    console.error('[watchlist] tick failed:', error instanceof Error ? error.message : error);
  }
}

export function startWatchlistRunner(): void {
  const st = state();
  if (st.started) return;
  st.started = true;
  const every = pollSeconds() * 1000;
  const loop = async () => {
    await tick();
    st.timer = setTimeout(loop, every);
    st.timer.unref?.();
  };
  // First run shortly after boot so the database and keys are ready.
  st.timer = setTimeout(loop, 10_000);
  st.timer.unref?.();
  console.log(`[watchlist] polling every ${every / 1000}s for servers with the feature enabled`);
}

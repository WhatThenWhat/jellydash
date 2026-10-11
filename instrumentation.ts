// Runs once when the Next.js server starts. The Watchlist poller only needs the Node runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.MASTER_KEY) return; // not configured (build step or first run); the entrypoint enforces it at start
  const { startWatchlistRunner } = await import('./lib/server/watchlistRunner.ts');
  startWatchlistRunner();
}

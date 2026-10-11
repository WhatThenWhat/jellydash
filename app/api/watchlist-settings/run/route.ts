import { route, selectedServer } from '@/lib/server/http';
import { runWatchlist, watchlistStore } from '@/lib/server/watchlistRunner';
import { NextResponse } from 'next/server';

/** Run one pass for the selected server now instead of waiting for the next poll. */
export const POST = route(async (request) => {
  const { server } = selectedServer(request);
  const summary = await runWatchlist(server.id);
  return NextResponse.json({ summary, run: watchlistStore().getRun(server.id) });
});

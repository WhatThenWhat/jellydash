import { route, selectedServer } from '@/lib/server/http';
import { NextResponse } from 'next/server';

/** Pull the current library list from Jellyfin into Jellydash. */
export const POST = route(async (request) => {
  const { svc, server } = selectedServer(request);
  const result = await svc.syncLibraries(server.id);
  return NextResponse.json({ added: result.added, removed: result.removed, total: result.libraries.length });
});

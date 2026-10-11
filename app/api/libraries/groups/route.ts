import { route, selectedServer } from '@/lib/server/http';
import type { LibraryWithGroups } from '@/lib/shared/types';
import { NextResponse } from 'next/server';

export const GET = route(async (request) => {
  const { svc, server } = selectedServer(request);
  const groups = svc.store.listGroups(server.id);
  const out: LibraryWithGroups[] = svc.store.listLibraries(server.id).map((l) => ({
    id: l.library_id,
    name: l.name,
    groups: groups.filter((g) => g.library_ids.includes(l.library_id)).map((g) => g.id)
  }));
  return NextResponse.json(out);
});

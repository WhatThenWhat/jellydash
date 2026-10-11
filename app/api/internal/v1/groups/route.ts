import { route } from '@/lib/server/http';
import { requireInternal } from '@/lib/server/internalAuth';
import { getService } from '@/lib/server/runtime';
import { NextResponse } from 'next/server';

/** List access groups. Filter with ?server_id= or ?jf_server_id= (the Jellyfin ServerId). */
export const GET = route(async (request) => {
  const denied = requireInternal(request);
  if (denied) return denied;
  const svc = getService();
  const url = new URL(request.url);
  const jf = url.searchParams.get('jf_server_id');
  let serverId = url.searchParams.get('server_id') ?? undefined;
  if (jf) {
    const s = svc.store.findServerByJfId(jf);
    if (!s) return NextResponse.json([]);
    serverId = s.id;
  }
  const groups = svc.store.listGroups(serverId);
  return NextResponse.json(
    groups.map((g) => ({
      id: g.id, server_id: g.server_id, name: g.name, max_rating: g.max_rating,
      library_count: g.library_ids.length, updated_at: g.updated_at
    }))
  );
});

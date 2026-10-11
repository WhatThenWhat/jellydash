import { route } from '@/lib/server/http';
import { requireInternal } from '@/lib/server/internalAuth';
import { getService } from '@/lib/server/runtime';
import { NextResponse } from 'next/server';

export const GET = route(async (request) => {
  const denied = requireInternal(request);
  if (denied) return denied;
  const servers = getService().store.listServers();
  return NextResponse.json(servers.map((s) => ({ id: s.id, name: s.name, jf_server_id: s.jf_server_id })));
});


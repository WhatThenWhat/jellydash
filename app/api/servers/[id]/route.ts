import { requireId } from '@/lib/core/validate';
import { jsonBody, route } from '@/lib/server/http';
import { getService } from '@/lib/server/runtime';
import { NextResponse } from 'next/server';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (request, ctx: Ctx) => {
  const id = requireId((await ctx.params).id, 'Server id');
  const body = await jsonBody(request);
  const updated = await getService().editServer(id, {
    name: typeof body.name === 'string' ? body.name : undefined,
    baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
    apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined
  });
  return NextResponse.json({ id: updated.id, name: updated.name, base_url: updated.base_url, jf_server_id: updated.jf_server_id });
});

/** Removes the server, its groups and membership history from Jellydash. Jellyfin itself is not touched. */
export const DELETE = route(async (_request, ctx: Ctx) => {
  const id = requireId((await ctx.params).id, 'Server id');
  getService().store.deleteServer(id);
  return NextResponse.json({ ok: true });
});

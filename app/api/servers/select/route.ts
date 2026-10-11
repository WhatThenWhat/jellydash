import { requireId } from '@/lib/core/validate';
import { jsonBody, route, SERVER_COOKIE, serverCookieOptions } from '@/lib/server/http';
import { getService } from '@/lib/server/runtime';
import { NextResponse } from 'next/server';

export const POST = route(async (request) => {
  const body = await jsonBody(request);
  const server = getService().store.getServer(requireId(body.id, 'Server id'));
  const res = NextResponse.json({ ok: true, selectedId: server.id });
  res.cookies.set(SERVER_COOKIE, server.id, serverCookieOptions());
  return res;
});

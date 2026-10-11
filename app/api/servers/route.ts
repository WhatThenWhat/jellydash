import { jsonBody, route, SERVER_COOKIE } from '@/lib/server/http';
import { getService } from '@/lib/server/runtime';
import { ValidationError } from '@/lib/core/errors';
import { NextResponse } from 'next/server';

function dto(s: { id: string; name: string; base_url: string; jf_server_id: string | null }) {
  return { id: s.id, name: s.name, base_url: s.base_url, jf_server_id: s.jf_server_id };
}

export const GET = route(async (request) => {
  const servers = getService().store.listServers();
  const wanted = request.cookies.get(SERVER_COOKIE)?.value;
  const selected = servers.find((s) => s.id === wanted) ?? servers[0];
  return NextResponse.json({ servers: servers.map(dto), selectedId: selected?.id ?? null });
});

export const POST = route(async (request) => {
  const body = await jsonBody(request);
  if (typeof body.name !== 'string' || typeof body.baseUrl !== 'string' || typeof body.apiKey !== 'string') {
    throw new ValidationError('name, baseUrl and apiKey are required');
  }
  const server = await getService().addServer({ name: body.name, baseUrl: body.baseUrl, apiKey: body.apiKey });
  return NextResponse.json(dto(server), { status: 201 });
});

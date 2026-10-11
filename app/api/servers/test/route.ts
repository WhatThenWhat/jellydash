import { ValidationError } from '@/lib/core/errors';
import { requireId } from '@/lib/core/validate';
import { jsonBody, route } from '@/lib/server/http';
import { getService } from '@/lib/server/runtime';
import { NextResponse } from 'next/server';

/** Connection test. With `id` and no apiKey it re-tests a stored server with its stored key. */
export const POST = route(async (request) => {
  const body = await jsonBody(request);
  const svc = getService();
  let baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl : '';
  let apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
  if (typeof body.id === 'string') {
    const server = svc.store.getServer(requireId(body.id, 'Server id'));
    baseUrl = baseUrl || server.base_url;
    apiKey = apiKey || svc.store.getApiKey(server.id);
  }
  if (!baseUrl || !apiKey) throw new ValidationError('baseUrl and apiKey are required');
  const result = await svc.probe(baseUrl, apiKey);
  return NextResponse.json({
    ok: true,
    serverName: result.serverName,
    version: result.version,
    jfServerId: result.jfServerId,
    libraryCount: result.libraries.length
  });
});

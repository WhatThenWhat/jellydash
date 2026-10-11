import { ValidationError } from '@/lib/core/errors';
import { requireId } from '@/lib/core/validate';
import { jsonBody, route, selectedServer } from '@/lib/server/http';
import { NextResponse } from 'next/server';

function parse(body: Record<string, unknown>) {
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : typeof body.id === 'string' ? [body.id] : [];
  if (!ids.length) throw new ValidationError('id or ids is required');
  return { ids, groupId: requireId(body.list, 'Group') };
}

/** Add one or more libraries (`id` or `ids`) to the access group named in `list`. */
export const POST = route(async (request) => {
  const { svc, server } = selectedServer(request);
  const { ids, groupId } = parse(await jsonBody(request));
  if (svc.store.getGroup(groupId).server_id !== server.id) throw new ValidationError('Group is not on the selected server');
  svc.store.addLibrariesToGroup(groupId, ids);
  return NextResponse.json({ ok: true, apply: await svc.applyGroupToMembers(groupId) });
});

export const DELETE = route(async (request) => {
  const { svc, server } = selectedServer(request);
  const { ids, groupId } = parse(await jsonBody(request));
  if (svc.store.getGroup(groupId).server_id !== server.id) throw new ValidationError('Group is not on the selected server');
  svc.store.removeLibrariesFromGroup(groupId, ids);
  return NextResponse.json({ ok: true, apply: await svc.applyGroupToMembers(groupId) });
});

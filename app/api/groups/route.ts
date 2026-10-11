import { ValidationError } from '@/lib/core/errors';
import { requireId } from '@/lib/core/validate';
import { jsonBody, route, selectedServer } from '@/lib/server/http';
import type { GroupDto } from '@/lib/shared/types';
import { NextResponse } from 'next/server';
import type { GroupRow, Store } from '@/lib/core/store';

function dto(store: Store, g: GroupRow): GroupDto {
  const count = store.db.prepare('SELECT COUNT(*) AS n FROM memberships WHERE group_id = ?').get(g.id) as { n: number };
  return {
    id: g.id, server_id: g.server_id, name: g.name, max_rating: g.max_rating, allowed_tags: g.allowed_tags,
    blocked_tags: g.blocked_tags, allow_downloads: g.allow_downloads, allow_live_tv: g.allow_live_tv,
    max_sessions: g.max_sessions, library_ids: g.library_ids, member_count: count.n
  };
}

export const GET = route(async (request) => {
  const { svc, server } = selectedServer(request);
  return NextResponse.json(svc.store.listGroups(server.id).map((g) => dto(svc.store, g)));
});

export const POST = route(async (request) => {
  const { svc, server } = selectedServer(request);
  const body = await jsonBody(request);
  return NextResponse.json(dto(svc.store, svc.store.createGroup(server.id, body)), { status: 201 });
});

/** Saving a group also pushes its settings to every recorded member. The save itself is not undone if some members fail. */
export const PATCH = route(async (request) => {
  const { svc, server } = selectedServer(request);
  const body = await jsonBody(request);
  const id = requireId(body.id, 'Group id');
  if (svc.store.getGroup(id).server_id !== server.id) throw new ValidationError('Group is not on the selected server');
  const { id: _omit, ...rest } = body;
  void _omit;
  const group = svc.store.updateGroup(id, rest);
  const apply = await svc.applyGroupToMembers(id);
  return NextResponse.json({ ...dto(svc.store, group), apply });
});

export const DELETE = route(async (request) => {
  const { svc, server } = selectedServer(request);
  const body = await jsonBody(request);
  const id = requireId(body.id, 'Group id');
  if (svc.store.getGroup(id).server_id !== server.id) throw new ValidationError('Group is not on the selected server');
  svc.store.deleteGroup(id);
  return NextResponse.json({ ok: true });
});

import { requireId, requireJfId } from '@/lib/core/validate';
import { jsonBody, route } from '@/lib/server/http';
import { requireInternal } from '@/lib/server/internalAuth';
import { getService } from '@/lib/server/runtime';
import { NextResponse } from 'next/server';

/** Wizarr reports a member after the account exists. Best effort on Wizarr's side. */
export const POST = route(async (request) => {
  const denied = requireInternal(request);
  if (denied) return denied;
  const body = await jsonBody(request);
  const store = getService().store;
  const group = store.getGroup(requireId(body.group_id, 'Group id'));
  store.recordMembership({
    serverId: group.server_id,
    groupId: group.id,
    groupName: group.name,
    jfUserId: requireJfId(body.jf_user_id, 'User id'),
    username: String(body.username ?? '').slice(0, 255) || 'unknown',
    source: 'wizarr'
  });
  return NextResponse.json({ ok: true }, { status: 201 });
});

import { ValidationError } from '@/lib/core/errors';
import { requireJfId } from '@/lib/core/validate';
import { jsonBody, route, selectedServer } from '@/lib/server/http';
import { NextResponse } from 'next/server';

/** Delete a Jellyfin user. Administrators are refused. */
export const DELETE = route(async (request) => {
  const { svc, server, client } = selectedServer(request);
  const body = await jsonBody(request);
  const id = requireJfId(body.Id, 'User id');
  const user = await client.getUser(id);
  if (user.Policy?.IsAdministrator === true) throw new ValidationError('Administrator accounts cannot be removed from Jellydash');
  await client.deleteUser(id);
  svc.store.deleteMembership(server.id, id);
  return NextResponse.json({ message: 'User removed' });
});

import { ValidationError } from '@/lib/core/errors';
import { requireJfId } from '@/lib/core/validate';
import { jsonBody, route, selectedServer } from '@/lib/server/http';
import { patchNonAdminPolicy } from '@/lib/server/userPolicy';
import { NextResponse } from 'next/server';

export const POST = route(async (request) => {
  const { client } = selectedServer(request);
  const body = await jsonBody(request);
  if (typeof body.IsDisabled !== 'boolean') throw new ValidationError('IsDisabled must be true or false');
  await patchNonAdminPolicy(client, requireJfId(body.Id, 'User id'), { IsDisabled: body.IsDisabled });
  return NextResponse.json({ message: `User was ${body.IsDisabled ? 'disabled' : 'enabled'}` });
});

import { ValidationError } from '@/lib/core/errors';
import { requireJfId } from '@/lib/core/validate';
import { jsonBody, route, selectedServer } from '@/lib/server/http';
import { patchNonAdminPolicy } from '@/lib/server/userPolicy';
import { NextResponse } from 'next/server';

export const POST = route(async (request) => {
  const { client } = selectedServer(request);
  const body = await jsonBody(request);
  if (typeof body.EnableContentDownloading !== 'boolean') throw new ValidationError('EnableContentDownloading must be true or false');
  await patchNonAdminPolicy(client, requireJfId(body.Id, 'User id'), { EnableContentDownloading: body.EnableContentDownloading });
  return NextResponse.json({ message: 'Download permission updated' });
});

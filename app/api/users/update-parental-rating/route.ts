import { requireJfId, optionalInt } from '@/lib/core/validate';
import { jsonBody, route, selectedServer } from '@/lib/server/http';
import { patchNonAdminPolicy } from '@/lib/server/userPolicy';
import { NextResponse } from 'next/server';

export const POST = route(async (request) => {
  const { client } = selectedServer(request);
  const body = await jsonBody(request);
  const rating = optionalInt(body.MaxParentalRating, 'Maximum parental rating', 0, 1000);
  await patchNonAdminPolicy(client, requireJfId(body.Id, 'User id'), { MaxParentalRating: rating });
  return NextResponse.json({ message: 'Max Parental Rating updated' });
});

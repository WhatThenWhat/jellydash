import { requireId } from '@/lib/core/validate';
import { jsonBody, route } from '@/lib/server/http';
import { getService } from '@/lib/server/runtime';
import { NextResponse } from 'next/server';

// The list of parental ratings offered in pickers. Global (shared by all servers).
export const GET = route(async () => NextResponse.json(getService().store.listRatings()));

export const POST = route(async (request) => {
  const body = await jsonBody(request);
  return NextResponse.json(getService().store.createRating(body.label, body.value));
});

export const PATCH = route(async (request) => {
  const body = await jsonBody(request);
  return NextResponse.json(getService().store.updateRating(requireId(body.id, 'Rating id'), body.label, body.value));
});

// Items already tagged with the value in Jellyfin keep it; this only changes what the pickers offer.
export const DELETE = route(async (request) => {
  const body = await jsonBody(request);
  getService().store.deleteRating(requireId(body.id, 'Rating id'));
  return NextResponse.json({ ok: true });
});

import { jsonBody, route } from '@/lib/server/http';
import { getService } from '@/lib/server/runtime';
import { NextResponse } from 'next/server';

// The tags offered on the Tag Content page. Global (shared by all servers), lowercase.
export const GET = route(async () => NextResponse.json(getService().store.listContentTags()));

export const POST = route(async (request) => {
  const body = await jsonBody(request);
  return NextResponse.json({ tag: getService().store.addContentTag(body.tag) }, { status: 201 });
});

// Items already carrying the tag in Jellyfin keep it; this only changes what the page offers.
export const DELETE = route(async (request) => {
  const body = await jsonBody(request);
  getService().store.deleteContentTag(body.tag);
  return NextResponse.json({ ok: true });
});

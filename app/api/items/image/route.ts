import { isItemId } from '@/lib/core/content';
import { ValidationError } from '@/lib/core/errors';
import { optionalInt } from '@/lib/core/validate';
import { route, selectedServer } from '@/lib/server/http';
import { NextResponse } from 'next/server';

const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Poster proxy. The browser never gets the API key and never talks to Jellyfin directly: this
 * route only ever calls the server selected in the header, with a validated item id and size.
 */
export const GET = route(async (request) => {
  const { client } = selectedServer(request);
  const params = request.nextUrl.searchParams;
  const id = params.get('id');
  if (!isItemId(id)) throw new ValidationError('Item id is not valid');
  const w = optionalInt(params.get('w') ?? 220, 'Width', 16, 800) ?? 220;
  const h = optionalInt(params.get('h') ?? 330, 'Height', 16, 1200) ?? 330;
  const img = await client.fetchImage(id, 'Primary', `?fillWidth=${w}&fillHeight=${h}&quality=90`);
  if (!img) return new NextResponse(null, { status: 404 });
  const type = img.contentType.split(';')[0].trim().toLowerCase();
  if (!TYPES.has(type)) return new NextResponse(null, { status: 502 });
  return new NextResponse(Buffer.from(img.bytes), {
    headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300' }
  });
});

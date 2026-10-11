import { ValidationError } from '@/lib/core/errors';
import { route, selectedServer } from '@/lib/server/http';
import { watchlistStore } from '@/lib/server/watchlistRunner';
import { NextResponse } from 'next/server';

export const GET = route(async (request) => {
  const { server } = selectedServer(request);
  const slot = request.nextUrl.searchParams.get('slot');
  if (slot !== 'movies' && slot !== 'view') throw new ValidationError('Unknown image');
  const img = watchlistStore().getImage(server.id, slot);
  if (!img) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(img.bytes), {
    headers: { 'Content-Type': img.contentType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=60' }
  });
});

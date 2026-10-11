import { loadRatableItems, pageOf } from '@/lib/core/content';
import { optionalInt } from '@/lib/core/validate';
import { cachedItems } from '@/lib/server/itemsCache';
import { route, selectedServer } from '@/lib/server/http';
import { NextResponse } from 'next/server';

/** Titles on the selected server, unrated first. Paged. */
export const GET = route(async (request) => {
  const { svc, server, client } = selectedServer(request);
  const params = request.nextUrl.searchParams;
  const page = optionalInt(params.get('page') ?? 0, 'Page', 0, 100000) ?? 0;
  const limit = optionalInt(params.get('limit') ?? 18, 'Limit', 1, 100) ?? 18;
  const items = await cachedItems(server.id, () => loadRatableItems(client));
  return NextResponse.json(pageOf(items, svc.store.listRatings(), page, limit));
});

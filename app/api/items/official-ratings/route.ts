import { loadRatableItems, NEEDS_RATING, pageOf, searchRatable } from '@/lib/core/content';
import { ValidationError } from '@/lib/core/errors';
import { optionalInt } from '@/lib/core/validate';
import { cachedItems } from '@/lib/server/itemsCache';
import { route, selectedServer } from '@/lib/server/http';
import { NextResponse } from 'next/server';

/**
 * Titles on the selected server, unrated first. Paged.
 * Optional `query` (title search) and `rating` (a configured rating, or "__needs__" for titles with
 * no rating or a rating outside the configured list).
 */
export const GET = route(async (request) => {
  const { svc, server, client } = selectedServer(request);
  const params = request.nextUrl.searchParams;
  const page = optionalInt(params.get('page') ?? 0, 'Page', 0, 100000) ?? 0;
  const limit = optionalInt(params.get('limit') ?? 18, 'Limit', 1, 100) ?? 18;
  const query = (params.get('query') ?? '').trim();
  if (query.length > 100) throw new ValidationError('The search text is too long');
  const choices = svc.store.listRatings();
  const rating = (params.get('rating') ?? '').trim();
  if (rating && rating !== NEEDS_RATING && !choices.some((c) => c.value.trim().toUpperCase() === rating.toUpperCase())) {
    throw new ValidationError('That rating is not in the Manage Ratings list');
  }
  const items = query ? await searchRatable(client, query) : await cachedItems(server.id, () => loadRatableItems(client));
  return NextResponse.json(pageOf(items, choices, page, limit, rating || undefined));
});

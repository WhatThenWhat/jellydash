import { loadRatableItems, searchRatable, tagPageOf } from '@/lib/core/content';
import { ValidationError } from '@/lib/core/errors';
import { normalizeTag, optionalInt } from '@/lib/core/validate';
import { route, selectedServer } from '@/lib/server/http';
import { cachedItems } from '@/lib/server/itemsCache';
import { NextResponse } from 'next/server';

/**
 * Titles on the selected server with their tags, newest first. Optional `query` (title search),
 * `tag` and `has` (1 = titles with the tag, 0 = titles without it).
 */
export const GET = route(async (request) => {
  const { svc, server, client } = selectedServer(request);
  const params = request.nextUrl.searchParams;
  const page = optionalInt(params.get('page') ?? 0, 'Page', 0, 100000) ?? 0;
  const limit = optionalInt(params.get('limit') ?? 18, 'Limit', 1, 100) ?? 18;
  const query = (params.get('query') ?? '').trim();
  if (query.length > 100) throw new ValidationError('The search text is too long');
  const tagParam = (params.get('tag') ?? '').trim();
  const tag = tagParam ? normalizeTag(tagParam) : undefined;
  if (tag && !svc.store.listContentTags().includes(tag)) throw new ValidationError('That tag is not in the Manage Tags list');
  const items = query ? await searchRatable(client, query) : await cachedItems(server.id, () => loadRatableItems(client));
  return NextResponse.json(tagPageOf(items, { tag, has: params.get('has') !== '0' }, page, limit));
});

import { pageOf, searchRatable } from '@/lib/core/content';
import { ValidationError } from '@/lib/core/errors';
import { optionalInt } from '@/lib/core/validate';
import { route, selectedServer } from '@/lib/server/http';
import { NextResponse } from 'next/server';

export const GET = route(async (request) => {
  const { svc, client } = selectedServer(request);
  const params = request.nextUrl.searchParams;
  const query = (params.get('query') ?? '').trim();
  if (!query) throw new ValidationError('Enter a title to search for');
  if (query.length > 100) throw new ValidationError('The search text is too long');
  const page = optionalInt(params.get('page') ?? 0, 'Page', 0, 100000) ?? 0;
  const limit = optionalInt(params.get('limit') ?? 18, 'Limit', 1, 100) ?? 18;
  const items = await searchRatable(client, query);
  return NextResponse.json(pageOf(items, svc.store.listRatings(), page, limit));
});

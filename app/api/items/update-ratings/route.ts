import { updateRatings } from '@/lib/core/content';
import { ValidationError } from '@/lib/core/errors';
import { jsonBodyAny, route, selectedServer } from '@/lib/server/http';
import { dropItems } from '@/lib/server/itemsCache';
import { NextResponse } from 'next/server';

/** Body: [{ ItemId, Rating }]. Each rating must be one of the configured choices. */
export const PATCH = route(async (request) => {
  const { svc, server, client } = selectedServer(request);
  const body = await jsonBodyAny(request);
  if (!Array.isArray(body)) throw new ValidationError('Expected a list of items');
  const result = await updateRatings(client, body, svc.store.listRatings());
  dropItems(server.id);
  return NextResponse.json(result);
});

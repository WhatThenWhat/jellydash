import { route } from '@/lib/server/http';
import { requireInternal } from '@/lib/server/internalAuth';
import { getService } from '@/lib/server/runtime';
import { requireId } from '@/lib/core/validate';
import { NextResponse } from 'next/server';

/** Resolve one group to the exact policy patch Wizarr applies at account activation. */
export const GET = route(async (request, ctx: { params: Promise<{ id: string }> }) => {
  const denied = requireInternal(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  return NextResponse.json(getService().resolveGroup(requireId(id, 'Group id')));
});

import { applyNewUserPrefs } from '@/lib/core/prefs';
import { jsonBody, route, selectedServer } from '@/lib/server/http';
import type { CreateUserResponse } from '@/lib/shared/types';
import { ValidationError } from '@/lib/core/errors';
import { requireId } from '@/lib/core/validate';
import { NextResponse } from 'next/server';

const SUBTITLE_LANGUAGE = process.env.DEFAULT_SUBTITLE_LANGUAGE?.trim() || 'eng';

export const POST = route(async (request) => {
  const { svc, server } = selectedServer(request);
  const body = await jsonBody(request);
  if (typeof body.Username !== 'string') throw new ValidationError('Username is required');
  const groupId = requireId(body.Package, 'Access group');
  const group = svc.store.getGroup(groupId);

  let warnings: string[] = [];
  const { user, password } = await svc.createUser({
    serverId: server.id,
    groupId,
    username: body.Username,
    password: typeof body.Pw === 'string' ? body.Pw : undefined,
    afterCreate: async (client, created) => {
      warnings = await applyNewUserPrefs(client, created.Id, group.library_ids, SUBTITLE_LANGUAGE);
    }
  });

  const res: CreateUserResponse = { User: { Id: user.Id, Name: user.Name }, Pw: password, warnings };
  return NextResponse.json(res, { status: 200 });
});

import type { UserRowDto } from '@/lib/shared/types';
import { route, selectedServer } from '@/lib/server/http';
import { NextResponse } from 'next/server';

export const GET = route(async (request) => {
  const { svc, server, client } = selectedServer(request);
  const users = await client.listUsers();
  const members = new Map(svc.store.listMemberships(server.id).map((m) => [m.jf_user_id.replace(/-/g, '').toLowerCase(), m.group_name]));

  users.sort((a, b) => new Date(b.LastActivityDate ?? 0).getTime() - new Date(a.LastActivityDate ?? 0).getTime());

  const out: UserRowDto[] = users.map((u) => {
    const p = (u.Policy ?? {}) as Record<string, unknown>;
    return {
      Id: u.Id,
      Name: u.Name,
      LastActivityDate: u.LastActivityDate,
      LastLoginDate: u.LastLoginDate,
      Group: members.get(u.Id.replace(/-/g, '').toLowerCase()) ?? null,
      Policy: {
        MaxParentalRating: (p.MaxParentalRating as number | null | undefined) ?? null,
        IsDisabled: p.IsDisabled === true,
        EnableLiveTvAccess: p.EnableLiveTvAccess === true,
        EnableContentDownloading: p.EnableContentDownloading === true,
        IsAdministrator: p.IsAdministrator === true
      }
    };
  });
  return NextResponse.json(out);
});

import { ValidationError } from '../core/errors.ts';
import type { JellyfinClient } from '../core/jellyfin.ts';

/** Patch one non-administrator user's policy. Administrators are never modified from here. */
export async function patchNonAdminPolicy(client: JellyfinClient, userId: string, patch: Record<string, unknown>) {
  const user = await client.getUser(userId);
  if (user.Policy?.IsAdministrator === true) throw new ValidationError('Administrator accounts cannot be changed from Jellydash');
  await client.applyPolicyPatch(userId, patch);
}

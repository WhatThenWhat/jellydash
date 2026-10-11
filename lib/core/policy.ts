import { ValidationError } from './errors.ts';

export type GroupSpec = {
  max_rating: number | null;
  allowed_tags: string[];
  blocked_tags: string[];
  allow_downloads: boolean;
  allow_live_tv: boolean;
  max_sessions: number;
  library_ids: string[];
};

/** Baseline applied by Create User in the admin UI. Wizarr invites do not use it (they patch only group fields). */
export const BASELINE_POLICY: Record<string, unknown> = {
  IsAdministrator: false,
  IsHidden: true,
  EnableCollectionManagement: false,
  EnableSubtitleManagement: false,
  EnableLyricManagement: false,
  EnableUserPreferenceAccess: true,
  AccessSchedules: [],
  BlockUnratedItems: [],
  EnableRemoteControlOfOtherUsers: false,
  EnableSharedDeviceControl: true,
  EnableRemoteAccess: true,
  EnableLiveTvManagement: false,
  EnableMediaPlayback: true,
  EnableAudioPlaybackTranscoding: true,
  EnableVideoPlaybackTranscoding: true,
  EnablePlaybackRemuxing: true,
  ForceRemoteSourceTranscoding: false,
  EnableContentDeletion: false,
  EnableContentDeletionFromFolders: [],
  EnableSyncTranscoding: true,
  EnableMediaConversion: true,
  EnabledDevices: [],
  EnableAllDevices: true,
  EnabledChannels: [],
  EnableAllChannels: true,
  InvalidLoginAttemptCount: 0,
  LoginAttemptsBeforeLockout: 3,
  EnablePublicSharing: true,
  RemoteClientBitrateLimit: 5000000
};

/** Policy keys the service is allowed to write. Anything else in a patch is rejected. */
export const WRITABLE_POLICY_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(BASELINE_POLICY),
  'IsDisabled',
  'EnabledFolders',
  'EnableAllFolders',
  'MaxParentalRating',
  'BlockedTags',
  'AllowedTags',
  'EnableContentDownloading',
  'EnableLiveTvAccess',
  'MaxActiveSessions',
  'SyncPlayAccess'
]);

/** Fields read back after a write. Baseline fields are not verified because Jellyfin may normalise them. */
export const VERIFIED_POLICY_KEYS: ReadonlySet<string> = new Set([
  'IsDisabled', 'EnableAllFolders', 'EnabledFolders', 'MaxParentalRating', 'BlockedTags', 'AllowedTags'
]);

/** The fields an access group controls. Always explicit, so applying a group is deterministic. */
export function groupPolicyPatch(group: GroupSpec): Record<string, unknown> {
  return {
    IsDisabled: false,
    EnableAllFolders: false,
    EnabledFolders: [...group.library_ids],
    MaxParentalRating: group.max_rating,
    BlockedTags: [...group.blocked_tags],
    AllowedTags: [...group.allowed_tags],
    EnableContentDownloading: group.allow_downloads,
    EnableLiveTvAccess: group.allow_live_tv,
    MaxActiveSessions: group.max_sessions,
    SyncPlayAccess: 'None'
  };
}

/** Reject unknown keys and anything that would grant admin rights or all-library access. */
export function sanitizePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!WRITABLE_POLICY_KEYS.has(key)) throw new ValidationError(`Policy field not allowed: ${key}`);
    out[key] = value;
  }
  if (out.IsAdministrator === true) throw new ValidationError('Refusing to grant administrator rights');
  if (out.EnableAllFolders === true) throw new ValidationError('Refusing to enable all folders');
  return out;
}

export function mergePolicy(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...current, ...sanitizePatch(patch) };
}

/** Keys from the patch whose value does not match the policy read back from Jellyfin. */
export function policyMismatches(readBack: Record<string, unknown>, patch: Record<string, unknown>): string[] {
  const bad: string[] = [];
  for (const [key, want] of Object.entries(patch)) {
    const got = readBack[key];
    if (Array.isArray(want)) {
      const norm = (list: unknown[]) => list.map((v) => String(v).replace(/-/g, '').toLowerCase()).sort();
      const a = norm(want);
      const b = Array.isArray(got) ? norm(got) : null;
      if (!b || a.length !== b.length || a.some((v, i) => v !== b[i])) bad.push(key);
    } else if ((got ?? null) !== (want ?? null)) {
      bad.push(key);
    }
  }
  return bad;
}

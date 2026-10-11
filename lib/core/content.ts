import { JellyfinError, ValidationError } from './errors.ts';
import type { JellyfinClient, JfUser } from './jellyfin.ts';

/** Rate Content: list titles that still need a parental rating and write ratings back. */

export type RatableItem = {
  Id: string;
  Name: string;
  Type: string;
  DateCreated?: string;
  OfficialRating?: string;
  ImageTags?: Record<string, string>;
  LockedFields?: string[];
  Tags?: string[];
};

export type RatingChoice = { value: string };

const ID_RE = /^[0-9a-f]{32}$/i;

export function isItemId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value);
}

export function norm(value: string | undefined | null): string {
  return (value ?? '').trim().toUpperCase();
}

/** An admin account on the server. Item reads and writes go through a user path. */
export async function adminUserId(client: JellyfinClient): Promise<string> {
  const users = await client.listUsers();
  const admin = users.find((u: JfUser) => u.Policy?.IsAdministrator === true && u.Policy?.IsDisabled !== true);
  if (!admin) throw new JellyfinError('bad_response', 'No enabled administrator account was found on this server');
  return admin.Id;
}

type Folder = { Name: string; ItemId: string; CollectionType?: string };

/** Movie and TV libraries. Libraries without a collection type (mixed content) are included. */
export function ratableLibraries(folders: Folder[]): Folder[] {
  return folders.filter((f) => {
    const t = (f.CollectionType ?? '').toLowerCase();
    return t === '' || t === 'movies' || t === 'tvshows';
  });
}

function time(item: RatableItem): number {
  return item.DateCreated ? new Date(item.DateCreated).getTime() || 0 : 0;
}

/** Unrated (or not in the configured list) first, then newest first inside each group. */
export function sortForRating(items: RatableItem[], choices: RatingChoice[]): RatableItem[] {
  const allowed = new Set(choices.map((c) => norm(c.value)));
  const rated = (i: RatableItem) => !!i.OfficialRating && allowed.has(norm(i.OfficialRating));
  return [...items].sort((a, b) => {
    const ra = rated(a);
    const rb = rated(b);
    if (ra !== rb) return ra ? 1 : -1;
    return time(b) - time(a);
  });
}

export type RatingPage = {
  Items: Array<{ Id: string; Name: string; Type: string; DateCreated?: string; OfficialRating: string }>;
  TotalRecordCount: number;
  MovieCount: number;
  SeriesCount: number;
  Page: number;
  TotalPages: number;
};

export async function loadRatableItems(client: JellyfinClient): Promise<RatableItem[]> {
  const folders = ratableLibraries(await client.virtualFolders());
  const all: RatableItem[] = [];
  for (const folder of folders) {
    const q = new URLSearchParams({
      Recursive: 'true',
      ParentId: folder.ItemId,
      IncludeItemTypes: 'Movie,Series',
      Fields: 'DateCreated,OfficialRating,Tags',
      EnableUserData: 'false',
      EnableImages: 'false'
    });
    const data = await client.get<{ Items?: RatableItem[] }>(`/Items?${q}`);
    all.push(...(data?.Items ?? []));
  }
  // The same title can be reachable through more than one library.
  const seen = new Set<string>();
  return all.filter((i) => (seen.has(i.Id) ? false : (seen.add(i.Id), true)));
}

export function pageOf(items: RatableItem[], choices: RatingChoice[], page: number, limit: number): RatingPage {
  const sorted = sortForRating(items, choices);
  const start = Math.max(0, page) * limit;
  return {
    Items: sorted.slice(start, start + limit).map((i) => ({
      Id: i.Id,
      Name: i.Name,
      Type: i.Type,
      DateCreated: i.DateCreated,
      OfficialRating: i.OfficialRating ?? ''
    })),
    TotalRecordCount: sorted.length,
    MovieCount: sorted.filter((i) => i.Type === 'Movie').length,
    SeriesCount: sorted.filter((i) => i.Type === 'Series').length,
    Page: page,
    TotalPages: Math.ceil(sorted.length / limit)
  };
}

export async function searchRatable(client: JellyfinClient, query: string): Promise<RatableItem[]> {
  const q = new URLSearchParams({
    Recursive: 'true',
    IncludeItemTypes: 'Series,Movie',
    Fields: 'DateCreated,OfficialRating,Tags',
    EnableUserData: 'false',
    SearchTerm: query,
    Limit: '200'
  });
  const data = await client.get<{ Items?: RatableItem[] }>(`/Items?${q}`);
  return data?.Items ?? [];
}

export type RatingUpdate = { ItemId: unknown; Rating: unknown };
export type RatingUpdateResult = { updated: number; failed: Array<{ id: string; error: string }> };

/**
 * Write ratings one item at a time (Jellyfin re-reads metadata on each save).
 * A rating must be one of the configured choices. The OfficialRating field is locked so a
 * metadata refresh does not overwrite it, and fields that were already locked stay locked.
 */
export async function updateRatings(
  client: JellyfinClient,
  updates: RatingUpdate[],
  choices: RatingChoice[]
): Promise<RatingUpdateResult> {
  if (!Array.isArray(updates)) throw new ValidationError('Expected a list of updates');
  if (updates.length > 200) throw new ValidationError('At most 200 items can be updated at once');
  const byNorm = new Map(choices.map((c) => [norm(c.value), c.value]));
  const prepared = updates.map((u) => {
    if (!isItemId(u?.ItemId)) throw new ValidationError('An item id is not valid');
    if (typeof u.Rating !== 'string') throw new ValidationError('A rating must be text');
    const value = byNorm.get(norm(u.Rating));
    if (value === undefined) throw new ValidationError(`"${u.Rating}" is not one of the configured ratings`);
    return { id: u.ItemId, rating: value };
  });

  const userId = await adminUserId(client);
  const result: RatingUpdateResult = { updated: 0, failed: [] };
  for (const { id, rating } of prepared) {
    try {
      const item = await client.get<RatableItem & Record<string, unknown>>(`/Users/${userId}/Items/${id}`);
      const locked = new Set([...(item.LockedFields ?? []), 'OfficialRating']);
      await client.post(`/Items/${id}`, { ...item, OfficialRating: rating, LockedFields: [...locked] });
      result.updated += 1;
    } catch (error) {
      result.failed.push({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

// ---- Tag Content ----

export type TagPage = {
  Items: Array<{ Id: string; Name: string; Type: string; DateCreated?: string; Tags: string[] }>;
  TotalRecordCount: number;
  MovieCount: number;
  SeriesCount: number;
  Page: number;
  TotalPages: number;
};

export type TagFilter = { tag?: string; has?: boolean };

const lower = (tags: string[] | undefined) => (tags ?? []).map((t) => t.trim().toLowerCase());

/** Newest first. With a filter, only titles that do (has) or do not (not has) carry the tag. */
export function tagPageOf(items: RatableItem[], filter: TagFilter, page: number, limit: number): TagPage {
  const wanted = filter.tag?.trim().toLowerCase();
  const kept = wanted
    ? items.filter((i) => lower(i.Tags).includes(wanted) === (filter.has !== false))
    : items;
  const sorted = [...kept].sort((a, b) => time(b) - time(a));
  const start = Math.max(0, page) * limit;
  return {
    Items: sorted.slice(start, start + limit).map((i) => ({
      Id: i.Id, Name: i.Name, Type: i.Type, DateCreated: i.DateCreated, Tags: i.Tags ?? []
    })),
    TotalRecordCount: sorted.length,
    MovieCount: sorted.filter((i) => i.Type === 'Movie').length,
    SeriesCount: sorted.filter((i) => i.Type === 'Series').length,
    Page: page,
    TotalPages: Math.ceil(sorted.length / limit)
  };
}

export type TagUpdate = { ItemId: unknown; Add?: unknown; Remove?: unknown };
export type TagUpdateResult = { updated: number; unchanged: number; failed: Array<{ id: string; error: string }> };

function tagList(value: unknown, allowed: Set<string>, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${label} must be a list`);
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') throw new ValidationError('A tag must be text');
    const tag = raw.trim().toLowerCase();
    if (!allowed.has(tag)) throw new ValidationError(`"${raw}" is not in the Manage Tags list`);
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

/**
 * Add and remove tags one item at a time. Existing tags are kept: only the named tags are added
 * or removed (matched ignoring case). The Tags field is locked so a metadata refresh does not
 * overwrite the result, and each item is read back to confirm the change stuck.
 */
export async function updateTags(
  client: JellyfinClient,
  updates: TagUpdate[],
  managedTags: string[]
): Promise<TagUpdateResult> {
  if (!Array.isArray(updates)) throw new ValidationError('Expected a list of updates');
  if (updates.length > 200) throw new ValidationError('At most 200 items can be updated at once');
  const allowed = new Set(managedTags);
  const prepared = updates.map((u) => {
    if (!isItemId(u?.ItemId)) throw new ValidationError('An item id is not valid');
    const add = tagList(u.Add, allowed, 'Add');
    const remove = tagList(u.Remove, allowed, 'Remove');
    if (add.some((t) => remove.includes(t))) throw new ValidationError('A tag cannot be added and removed in the same update');
    return { id: u.ItemId, add, remove };
  });

  const userId = await adminUserId(client);
  const result: TagUpdateResult = { updated: 0, unchanged: 0, failed: [] };
  for (const { id, add, remove } of prepared) {
    try {
      const item = await client.get<RatableItem & Record<string, unknown>>(`/Users/${userId}/Items/${id}`);
      const current = item.Tags ?? [];
      const next = current.filter((t) => !remove.includes(t.trim().toLowerCase()));
      for (const tag of add) if (!next.some((t) => t.trim().toLowerCase() === tag)) next.push(tag);
      const same = next.length === current.length && next.every((t, i) => t === current[i]);
      if (same) {
        result.unchanged += 1;
        continue;
      }
      const locked = new Set([...(item.LockedFields ?? []), 'Tags']);
      await client.post(`/Items/${id}`, { ...item, Tags: next, LockedFields: [...locked] });
      const after = await client.get<RatableItem>(`/Users/${userId}/Items/${id}`);
      const got = lower(after.Tags);
      const bad = [...add.filter((t) => !got.includes(t)), ...remove.filter((t) => got.includes(t))];
      if (bad.length) throw new JellyfinError('bad_response', `Jellyfin did not keep the change for: ${bad.join(', ')}`);
      result.updated += 1;
    } catch (error) {
      result.failed.push({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

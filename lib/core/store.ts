import { randomBytes } from 'node:crypto';
import { decrypt, encrypt } from './crypto.ts';
import type { Db } from './db.ts';
import { ConflictError, NotFoundError, ValidationError } from './errors.ts';
import type { GroupSpec } from './policy.ts';
import { normalizeTag, normalizeTags, optionalInt, requireName } from './validate.ts';

export type ServerRow = {
  id: string;
  name: string;
  base_url: string;
  jf_server_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LibraryRow = { library_id: string; name: string };

export type GroupRow = {
  id: string;
  server_id: string;
  name: string;
  max_rating: number | null;
  allowed_tags: string[];
  blocked_tags: string[];
  allow_downloads: boolean;
  allow_live_tv: boolean;
  max_sessions: number;
  library_ids: string[];
  created_at: string;
  updated_at: string;
};

export type RatingRow = { id: string; label: string; value: string };

export type MembershipRow = {
  id: number;
  server_id: string;
  group_id: string | null;
  group_name: string;
  jf_user_id: string;
  username: string;
  source: string;
  created_at: string;
};

const newId = () => randomBytes(9).toString('hex');
const now = () => new Date().toISOString();

type RawGroup = {
  id: string; server_id: string; name: string; max_rating: number | null; allowed_tags: string; blocked_tags: string;
  allow_downloads: number; allow_live_tv: number; max_sessions: number; created_at: string; updated_at: string;
};

export class Store {
  db: Db;
  key: Buffer;

  constructor(db: Db, key: Buffer) {
    this.db = db;
    this.key = key;
  }

  // ---- servers ----

  listServers(): ServerRow[] {
    return this.db
      .prepare('SELECT id, name, base_url, jf_server_id, created_at, updated_at FROM servers ORDER BY name COLLATE NOCASE')
      .all() as ServerRow[];
  }

  getServer(id: string): ServerRow {
    const row = this.db
      .prepare('SELECT id, name, base_url, jf_server_id, created_at, updated_at FROM servers WHERE id = ?')
      .get(id) as ServerRow | undefined;
    if (!row) throw new NotFoundError('Server not found');
    return row;
  }

  getApiKey(serverId: string): string {
    const row = this.db.prepare('SELECT api_key_enc FROM servers WHERE id = ?').get(serverId) as { api_key_enc: string } | undefined;
    if (!row) throw new NotFoundError('Server not found');
    return decrypt(row.api_key_enc, this.key, `server:${serverId}`);
  }

  findServerByJfId(jfServerId: string): ServerRow | undefined {
    return this.db
      .prepare('SELECT id, name, base_url, jf_server_id, created_at, updated_at FROM servers WHERE jf_server_id = ?')
      .get(jfServerId) as ServerRow | undefined;
  }

  createServer(input: { name: string; baseUrl: string; apiKey: string; jfServerId: string | null }): ServerRow {
    const name = requireName(input.name, 'Server name');
    if (!input.apiKey.trim()) throw new ValidationError('API key is required');
    const id = newId();
    const ts = now();
    try {
      this.db
        .prepare('INSERT INTO servers (id, name, base_url, jf_server_id, api_key_enc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, name, input.baseUrl, input.jfServerId, encrypt(input.apiKey.trim(), this.key, `server:${id}`), ts, ts);
    } catch (error) {
      if (String((error as Error).message).includes('UNIQUE')) throw new ConflictError('A server with that name already exists');
      throw error;
    }
    return this.getServer(id);
  }

  updateServer(id: string, input: { name?: string; baseUrl?: string; apiKey?: string; jfServerId?: string | null }): ServerRow {
    this.getServer(id);
    const sets: string[] = [];
    const args: (string | null)[] = [];
    if (input.name !== undefined) { sets.push('name = ?'); args.push(requireName(input.name, 'Server name')); }
    if (input.baseUrl !== undefined) { sets.push('base_url = ?'); args.push(input.baseUrl); }
    if (input.jfServerId !== undefined) { sets.push('jf_server_id = ?'); args.push(input.jfServerId); }
    if (input.apiKey !== undefined && input.apiKey.trim()) {
      sets.push('api_key_enc = ?');
      args.push(encrypt(input.apiKey.trim(), this.key, `server:${id}`));
    }
    if (sets.length) {
      sets.push('updated_at = ?');
      args.push(now());
      try {
        this.db.prepare(`UPDATE servers SET ${sets.join(', ')} WHERE id = ?`).run(...args, id);
      } catch (error) {
        if (String((error as Error).message).includes('UNIQUE')) throw new ConflictError('A server with that name already exists');
        throw error;
      }
    }
    return this.getServer(id);
  }

  deleteServer(id: string): void {
    this.getServer(id);
    this.db.prepare('DELETE FROM servers WHERE id = ?').run(id);
  }

  // ---- libraries ----

  listLibraries(serverId: string): LibraryRow[] {
    return this.db
      .prepare('SELECT library_id, name FROM libraries WHERE server_id = ? ORDER BY name COLLATE NOCASE')
      .all(serverId) as LibraryRow[];
  }

  /** Replace the catalog with what Jellyfin reports. Group memberships of removed libraries are dropped. */
  replaceLibraries(serverId: string, libs: Array<{ id: string; name: string }>): { added: number; removed: number } {
    const before = new Set(this.listLibraries(serverId).map((l) => l.library_id));
    const after = new Set(libs.map((l) => l.id));
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM libraries WHERE server_id = ?').run(serverId);
      const ins = this.db.prepare('INSERT INTO libraries (server_id, library_id, name) VALUES (?, ?, ?)');
      for (const l of libs) ins.run(serverId, l.id, l.name);
      for (const gone of before) {
        if (!after.has(gone)) {
          this.db
            .prepare('DELETE FROM group_libraries WHERE library_id = ? AND group_id IN (SELECT id FROM access_groups WHERE server_id = ?)')
            .run(gone, serverId);
        }
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { added: [...after].filter((i) => !before.has(i)).length, removed: [...before].filter((i) => !after.has(i)).length };
  }

  // ---- access groups ----

  private hydrate(raw: RawGroup): GroupRow {
    const libs = this.db.prepare('SELECT library_id FROM group_libraries WHERE group_id = ? ORDER BY library_id').all(raw.id) as Array<{ library_id: string }>;
    return {
      id: raw.id,
      server_id: raw.server_id,
      name: raw.name,
      max_rating: raw.max_rating,
      allowed_tags: JSON.parse(raw.allowed_tags),
      blocked_tags: JSON.parse(raw.blocked_tags),
      allow_downloads: raw.allow_downloads === 1,
      allow_live_tv: raw.allow_live_tv === 1,
      max_sessions: raw.max_sessions,
      library_ids: libs.map((l) => l.library_id),
      created_at: raw.created_at,
      updated_at: raw.updated_at
    };
  }

  listGroups(serverId?: string): GroupRow[] {
    const rows = (serverId
      ? this.db.prepare('SELECT * FROM access_groups WHERE server_id = ? ORDER BY name COLLATE NOCASE').all(serverId)
      : this.db.prepare('SELECT * FROM access_groups ORDER BY server_id, name COLLATE NOCASE').all()) as RawGroup[];
    return rows.map((r) => this.hydrate(r));
  }

  getGroup(id: string): GroupRow {
    const raw = this.db.prepare('SELECT * FROM access_groups WHERE id = ?').get(id) as RawGroup | undefined;
    if (!raw) throw new NotFoundError('Access group not found');
    return this.hydrate(raw);
  }

  private parseGroupInput(serverId: string, input: Record<string, unknown>) {
    const name = requireName(input.name, 'Group name');
    const max_rating = optionalInt(input.max_rating, 'Maximum parental rating', 0, 1000);
    const max_sessions = optionalInt(input.max_sessions, 'Max sessions', 0, 100) ?? 2;
    const allowed = normalizeTags(input.allowed_tags);
    const blocked = normalizeTags(input.blocked_tags);
    const libs = Array.isArray(input.library_ids) ? (input.library_ids as unknown[]).map(String) : [];
    const known = new Set(this.listLibraries(serverId).map((l) => l.library_id));
    const unknown = libs.filter((l) => !known.has(l));
    if (unknown.length) throw new ValidationError('One or more libraries are not in this server\'s library list. Run Sync first.');
    return {
      name, max_rating, max_sessions, allowed, blocked,
      allow_downloads: input.allow_downloads === true ? 1 : 0,
      allow_live_tv: input.allow_live_tv === true ? 1 : 0,
      libs: [...new Set(libs)]
    };
  }

  createGroup(serverId: string, input: Record<string, unknown>): GroupRow {
    this.getServer(serverId);
    const g = this.parseGroupInput(serverId, input);
    const id = newId();
    const ts = now();
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('INSERT INTO access_groups (id, server_id, name, max_rating, allowed_tags, blocked_tags, allow_downloads, allow_live_tv, max_sessions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, serverId, g.name, g.max_rating, JSON.stringify(g.allowed), JSON.stringify(g.blocked), g.allow_downloads, g.allow_live_tv, g.max_sessions, ts, ts);
      const ins = this.db.prepare('INSERT INTO group_libraries (group_id, library_id) VALUES (?, ?)');
      for (const l of g.libs) ins.run(id, l);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      if (String((error as Error).message).includes('UNIQUE')) throw new ConflictError('A group with that name already exists on this server');
      throw error;
    }
    return this.getGroup(id);
  }

  updateGroup(id: string, input: Record<string, unknown>): GroupRow {
    const existing = this.getGroup(id);
    const g = this.parseGroupInput(existing.server_id, { ...existing, ...input });
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('UPDATE access_groups SET name = ?, max_rating = ?, allowed_tags = ?, blocked_tags = ?, allow_downloads = ?, allow_live_tv = ?, max_sessions = ?, updated_at = ? WHERE id = ?')
        .run(g.name, g.max_rating, JSON.stringify(g.allowed), JSON.stringify(g.blocked), g.allow_downloads, g.allow_live_tv, g.max_sessions, now(), id);
      this.db.prepare('DELETE FROM group_libraries WHERE group_id = ?').run(id);
      const ins = this.db.prepare('INSERT INTO group_libraries (group_id, library_id) VALUES (?, ?)');
      for (const l of g.libs) ins.run(id, l);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      if (String((error as Error).message).includes('UNIQUE')) throw new ConflictError('A group with that name already exists on this server');
      throw error;
    }
    return this.getGroup(id);
  }

  addLibrariesToGroup(id: string, libraryIds: string[]): GroupRow {
    const g = this.getGroup(id);
    return this.updateGroup(id, { library_ids: [...new Set([...g.library_ids, ...libraryIds])] });
  }

  removeLibrariesFromGroup(id: string, libraryIds: string[]): GroupRow {
    const g = this.getGroup(id);
    const drop = new Set(libraryIds);
    return this.updateGroup(id, { library_ids: g.library_ids.filter((l) => !drop.has(l)) });
  }

  /** Deleting a group does not touch Jellyfin users. Memberships keep the group name for history. */
  deleteGroup(id: string): void {
    this.getGroup(id);
    this.db.prepare('DELETE FROM access_groups WHERE id = ?').run(id);
  }

  groupSpec(g: GroupRow): GroupSpec {
    return {
      max_rating: g.max_rating, allowed_tags: g.allowed_tags, blocked_tags: g.blocked_tags,
      allow_downloads: g.allow_downloads, allow_live_tv: g.allow_live_tv, max_sessions: g.max_sessions, library_ids: g.library_ids
    };
  }

  // ---- memberships ----

  recordMembership(input: { serverId: string; groupId: string | null; groupName: string; jfUserId: string; username: string; source: string }): void {
    this.db
      .prepare(`INSERT INTO memberships (server_id, group_id, group_name, jf_user_id, username, source, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(server_id, jf_user_id) DO UPDATE SET group_id = excluded.group_id, group_name = excluded.group_name, username = excluded.username, source = excluded.source`)
      .run(input.serverId, input.groupId, input.groupName, input.jfUserId, input.username, input.source, now());
  }

  listMemberships(serverId: string): MembershipRow[] {
    return this.db.prepare('SELECT * FROM memberships WHERE server_id = ? ORDER BY username COLLATE NOCASE').all(serverId) as MembershipRow[];
  }

  listGroupMembers(groupId: string): MembershipRow[] {
    return this.db.prepare('SELECT * FROM memberships WHERE group_id = ? ORDER BY username COLLATE NOCASE').all(groupId) as MembershipRow[];
  }

  deleteMembership(serverId: string, jfUserId: string): void {
    this.db.prepare('DELETE FROM memberships WHERE server_id = ? AND jf_user_id = ?').run(serverId, jfUserId);
  }

  // ---- ratings ----

  listRatings(): RatingRow[] {
    return this.db.prepare('SELECT id, label, value FROM ratings ORDER BY position, label COLLATE NOCASE').all() as RatingRow[];
  }

  createRating(label: unknown, value: unknown): RatingRow {
    const l = requireName(label, 'Label');
    const v = requireName(value, 'Value');
    const base = l.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'rating';
    const taken = new Set(this.listRatings().map((r) => r.id));
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    const pos = (this.db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM ratings').get() as { p: number }).p;
    this.db.prepare('INSERT INTO ratings (id, label, value, position) VALUES (?, ?, ?, ?)').run(id, l, v, pos);
    return { id, label: l, value: v };
  }

  updateRating(id: string, label: unknown, value: unknown): RatingRow {
    const cur = this.listRatings().find((r) => r.id === id);
    if (!cur) throw new NotFoundError('Rating not found');
    const l = typeof label === 'string' && label.trim() ? requireName(label, 'Label') : cur.label;
    const v = typeof value === 'string' && value.trim() ? requireName(value, 'Value') : cur.value;
    this.db.prepare('UPDATE ratings SET label = ?, value = ? WHERE id = ?').run(l, v, id);
    return { id, label: l, value: v };
  }

  deleteRating(id: string): void {
    this.db.prepare('DELETE FROM ratings WHERE id = ?').run(id);
  }

  // ---- content tags ----

  listContentTags(): string[] {
    return (this.db.prepare('SELECT tag FROM content_tags ORDER BY position, tag').all() as Array<{ tag: string }>).map((r) => r.tag);
  }

  addContentTag(value: unknown): string {
    const tag = normalizeTag(value);
    if (this.listContentTags().includes(tag)) throw new ConflictError('That tag is already in the list');
    const pos = (this.db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM content_tags').get() as { p: number }).p;
    this.db.prepare('INSERT INTO content_tags (tag, position) VALUES (?, ?)').run(tag, pos);
    return tag;
  }

  /** Only removes the tag from the picker. Items already carrying it in Jellyfin keep it. */
  deleteContentTag(value: unknown): void {
    this.db.prepare('DELETE FROM content_tags WHERE tag = ?').run(normalizeTag(value));
  }
}

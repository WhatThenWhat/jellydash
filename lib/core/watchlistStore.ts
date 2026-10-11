import type { Db } from './db.ts';
import { ValidationError } from './errors.ts';

export type WatchlistSettings = { enabled: boolean; moviesName: string; viewName: string };
export type ImageSlot = 'movies' | 'view';
export type TrackedPlaylist = { jfUserId: string; kind: 'movies' | 'series'; seriesId: string; playlistId: string };
export type SeenFavorite = { itemId: string; itemType: string; seriesId: string | null; seriesName: string | null };
export type RunInfo = { lastRunAt: string | null; lastOk: boolean | null; lastError: string | null; lastSummary: string | null };

export const DEFAULT_MOVIES_NAME = 'Watchlist';
export const DEFAULT_VIEW_NAME = 'Playlists';

const now = () => new Date().toISOString();

export function validateDisplayName(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new ValidationError(`${label} is required`);
  const v = value.trim();
  if (!v) throw new ValidationError(`${label} is required`);
  if (v.length > 100) throw new ValidationError(`${label} must be 100 characters or fewer`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v)) throw new ValidationError(`${label} contains control characters`);
  return v;
}

/** PNG or JPEG only, decided by the bytes, never by the uploaded file name or type. */
export function sniffImage(bytes: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export class WatchlistStore {
  db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  getSettings(serverId: string): WatchlistSettings {
    const r = this.db.prepare('SELECT enabled, movies_name, view_name FROM watchlist_settings WHERE server_id = ?').get(serverId) as
      | { enabled: number; movies_name: string; view_name: string }
      | undefined;
    return r
      ? { enabled: r.enabled === 1, moviesName: r.movies_name, viewName: r.view_name }
      : { enabled: false, moviesName: DEFAULT_MOVIES_NAME, viewName: DEFAULT_VIEW_NAME };
  }

  saveSettings(serverId: string, patch: Partial<WatchlistSettings>): WatchlistSettings {
    const cur = this.getSettings(serverId);
    const next: WatchlistSettings = {
      enabled: patch.enabled ?? cur.enabled,
      moviesName: patch.moviesName !== undefined ? validateDisplayName(patch.moviesName, 'Watchlist name') : cur.moviesName,
      viewName: patch.viewName !== undefined ? validateDisplayName(patch.viewName, 'Playlists tile name') : cur.viewName
    };
    this.db
      .prepare(
        `INSERT INTO watchlist_settings (server_id, enabled, movies_name, view_name, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET enabled = excluded.enabled, movies_name = excluded.movies_name,
         view_name = excluded.view_name, updated_at = excluded.updated_at`
      )
      .run(serverId, next.enabled ? 1 : 0, next.moviesName, next.viewName, now());
    return next;
  }

  enabledServerIds(): string[] {
    return (this.db.prepare('SELECT server_id FROM watchlist_settings WHERE enabled = 1').all() as Array<{ server_id: string }>).map((r) => r.server_id);
  }

  // ---- images ----
  saveImage(serverId: string, slot: ImageSlot, bytes: Uint8Array): void {
    if (bytes.length === 0) throw new ValidationError('The image is empty');
    if (bytes.length > MAX_IMAGE_BYTES) throw new ValidationError('The image is larger than 2 MB');
    const type = sniffImage(bytes);
    if (!type) throw new ValidationError('The image must be a PNG or JPEG file');
    this.db
      .prepare(
        `INSERT INTO watchlist_images (server_id, slot, content_type, bytes, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(server_id, slot) DO UPDATE SET content_type = excluded.content_type, bytes = excluded.bytes, updated_at = excluded.updated_at`
      )
      .run(serverId, slot, type, bytes, now());
  }

  getImage(serverId: string, slot: ImageSlot): { contentType: string; bytes: Uint8Array; updatedAt: string } | null {
    const r = this.db.prepare('SELECT content_type, bytes, updated_at FROM watchlist_images WHERE server_id = ? AND slot = ?').get(serverId, slot) as
      | { content_type: string; bytes: Uint8Array; updated_at: string }
      | undefined;
    return r ? { contentType: r.content_type, bytes: r.bytes, updatedAt: r.updated_at } : null;
  }

  imageStamp(serverId: string, slot: ImageSlot): string | null {
    const r = this.db.prepare('SELECT updated_at FROM watchlist_images WHERE server_id = ? AND slot = ?').get(serverId, slot) as { updated_at: string } | undefined;
    return r?.updated_at ?? null;
  }

  // ---- tracked playlists ----
  getPlaylist(serverId: string, jfUserId: string, kind: 'movies' | 'series', seriesId = ''): string | undefined {
    const r = this.db
      .prepare('SELECT playlist_id FROM watchlist_playlists WHERE server_id = ? AND jf_user_id = ? AND kind = ? AND series_id = ?')
      .get(serverId, jfUserId, kind, seriesId) as { playlist_id: string } | undefined;
    return r?.playlist_id;
  }

  setPlaylist(serverId: string, jfUserId: string, kind: 'movies' | 'series', seriesId: string, playlistId: string): void {
    this.db
      .prepare(
        `INSERT INTO watchlist_playlists (server_id, jf_user_id, kind, series_id, playlist_id) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(server_id, jf_user_id, kind, series_id) DO UPDATE SET playlist_id = excluded.playlist_id`
      )
      .run(serverId, jfUserId, kind, seriesId, playlistId);
  }

  removePlaylist(serverId: string, jfUserId: string, kind: 'movies' | 'series', seriesId = ''): void {
    this.db.prepare('DELETE FROM watchlist_playlists WHERE server_id = ? AND jf_user_id = ? AND kind = ? AND series_id = ?').run(serverId, jfUserId, kind, seriesId);
  }

  listPlaylists(serverId: string, jfUserId?: string): TrackedPlaylist[] {
    const rows = (
      jfUserId
        ? this.db.prepare('SELECT jf_user_id, kind, series_id, playlist_id FROM watchlist_playlists WHERE server_id = ? AND jf_user_id = ?').all(serverId, jfUserId)
        : this.db.prepare('SELECT jf_user_id, kind, series_id, playlist_id FROM watchlist_playlists WHERE server_id = ?').all(serverId)
    ) as Array<{ jf_user_id: string; kind: 'movies' | 'series'; series_id: string; playlist_id: string }>;
    return rows.map((r) => ({ jfUserId: r.jf_user_id, kind: r.kind, seriesId: r.series_id, playlistId: r.playlist_id }));
  }

  // ---- favorites already handled ----
  listSeen(serverId: string, jfUserId: string): SeenFavorite[] {
    const rows = this.db.prepare('SELECT item_id, item_type, series_id, series_name FROM watchlist_seen WHERE server_id = ? AND jf_user_id = ?').all(serverId, jfUserId) as Array<{
      item_id: string; item_type: string; series_id: string | null; series_name: string | null;
    }>;
    return rows.map((r) => ({ itemId: r.item_id, itemType: r.item_type, seriesId: r.series_id, seriesName: r.series_name }));
  }

  markSeen(serverId: string, jfUserId: string, f: SeenFavorite): void {
    this.db
      .prepare(
        `INSERT INTO watchlist_seen (server_id, jf_user_id, item_id, item_type, series_id, series_name) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(server_id, jf_user_id, item_id) DO UPDATE SET item_type = excluded.item_type, series_id = excluded.series_id, series_name = excluded.series_name`
      )
      .run(serverId, jfUserId, f.itemId, f.itemType, f.seriesId, f.seriesName);
  }

  unmarkSeen(serverId: string, jfUserId: string, itemId: string): void {
    this.db.prepare('DELETE FROM watchlist_seen WHERE server_id = ? AND jf_user_id = ? AND item_id = ?').run(serverId, jfUserId, itemId);
  }

  /** Forget everything tracked for users that no longer exist on the server. */
  forgetUsers(serverId: string, keep: string[]): void {
    const rows = this.db.prepare('SELECT DISTINCT jf_user_id AS u FROM watchlist_seen WHERE server_id = ? UNION SELECT DISTINCT jf_user_id FROM watchlist_playlists WHERE server_id = ?').all(serverId, serverId) as Array<{ u: string }>;
    const keepSet = new Set(keep);
    for (const { u } of rows) {
      if (keepSet.has(u)) continue;
      this.db.prepare('DELETE FROM watchlist_seen WHERE server_id = ? AND jf_user_id = ?').run(serverId, u);
      this.db.prepare('DELETE FROM watchlist_playlists WHERE server_id = ? AND jf_user_id = ?').run(serverId, u);
    }
  }

  // ---- last run ----
  saveRun(serverId: string, ok: boolean, error: string | null, summary: string | null): void {
    this.db
      .prepare(
        `INSERT INTO watchlist_runs (server_id, last_run_at, last_ok, last_error, last_summary) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET last_run_at = excluded.last_run_at, last_ok = excluded.last_ok,
         last_error = excluded.last_error, last_summary = excluded.last_summary`
      )
      .run(serverId, now(), ok ? 1 : 0, error, summary);
  }

  getRun(serverId: string): RunInfo {
    const r = this.db.prepare('SELECT last_run_at, last_ok, last_error, last_summary FROM watchlist_runs WHERE server_id = ?').get(serverId) as
      | { last_run_at: string | null; last_ok: number | null; last_error: string | null; last_summary: string | null }
      | undefined;
    return r
      ? { lastRunAt: r.last_run_at, lastOk: r.last_ok === null ? null : r.last_ok === 1, lastError: r.last_error, lastSummary: r.last_summary }
      : { lastRunAt: null, lastOk: null, lastError: null, lastSummary: null };
  }
}

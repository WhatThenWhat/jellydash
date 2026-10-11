import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
// node:sqlite ships with Node >= 22.13. Its typings need @types/node >= 22.5, so the import is untyped
// here and the small surface this app uses is described below.
// @ts-ignore
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS: string[] = [
  // v1: servers, libraries, access groups, memberships
  `
  CREATE TABLE servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    base_url TEXT NOT NULL,
    jf_server_id TEXT,
    api_key_enc TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE libraries (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    library_id TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (server_id, library_id)
  );
  CREATE TABLE access_groups (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    max_rating INTEGER,
    allowed_tags TEXT NOT NULL DEFAULT '[]',
    blocked_tags TEXT NOT NULL DEFAULT '[]',
    allow_downloads INTEGER NOT NULL DEFAULT 0,
    allow_live_tv INTEGER NOT NULL DEFAULT 0,
    max_sessions INTEGER NOT NULL DEFAULT 2,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (server_id, name)
  );
  CREATE TABLE group_libraries (
    group_id TEXT NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
    library_id TEXT NOT NULL,
    PRIMARY KEY (group_id, library_id)
  );
  CREATE TABLE memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES access_groups(id) ON DELETE SET NULL,
    group_name TEXT NOT NULL,
    jf_user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (server_id, jf_user_id)
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // v2: parental rating choices offered in pickers (global, not per server)
  `
  CREATE TABLE ratings (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    position INTEGER NOT NULL
  );
  `,
  // v3: watchlist (favorites to playlists), per server
  `
  CREATE TABLE watchlist_settings (
    server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 0,
    movies_name TEXT NOT NULL DEFAULT 'Watchlist',
    view_name TEXT NOT NULL DEFAULT 'Playlists',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE watchlist_images (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    slot TEXT NOT NULL CHECK (slot IN ('movies', 'view')),
    content_type TEXT NOT NULL,
    bytes BLOB NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (server_id, slot)
  );
  CREATE TABLE watchlist_playlists (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    jf_user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('movies', 'series')),
    series_id TEXT NOT NULL DEFAULT '',
    playlist_id TEXT NOT NULL,
    PRIMARY KEY (server_id, jf_user_id, kind, series_id)
  );
  CREATE TABLE watchlist_seen (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    jf_user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    series_id TEXT,
    series_name TEXT,
    PRIMARY KEY (server_id, jf_user_id, item_id)
  );
  CREATE TABLE watchlist_runs (
    server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
    last_run_at TEXT,
    last_ok INTEGER,
    last_error TEXT,
    last_summary TEXT
  );
  `
];

type SqlValue = string | number | bigint | null | Uint8Array;

export interface Statement {
  run(...params: SqlValue[]): unknown;
  get(...params: SqlValue[]): unknown;
  all(...params: SqlValue[]): unknown[];
}

export interface Db {
  exec(sql: string): void;
  prepare(sql: string): Statement;
}

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db: Db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  let version = row.user_version;
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      version += 1;
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

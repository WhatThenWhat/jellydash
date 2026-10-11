import { JellyfinError } from './errors.ts';
import type { JellyfinClient, JfUser } from './jellyfin.ts';
import type { SeenFavorite, WatchlistSettings, WatchlistStore } from './watchlistStore.ts';

/**
 * Watchlist: a user's favorites are mirrored into playlists on the same server.
 *
 *  - Movies and other non-episodic favorites go to one "Watchlist" playlist per user.
 *  - An episode, season or series favorite goes to a playlist named after the series,
 *    holding the unwatched episodes (from the favorited episode onward for an episode).
 *  - Unfavoriting removes the item again. Unfavoriting a series or season removes the whole playlist.
 *  - Watched items are removed on every run. An emptied playlist is deleted.
 *
 * Jellyfin has no usable event feed without a plugin, so each run diffs the current favorites against
 * the set handled before (watchlist_seen). The first run for a user therefore backfills.
 */

export const WATCHLIST_SORT_NAME = '0';
const FAVORITE_TYPES = 'Movie,Series,Season,Episode,Video';
const ADD_CHUNK = 50;

type Favorite = {
  Id: string;
  Name: string;
  Type: string;
  SeriesId?: string;
  SeriesName?: string;
  UserData?: { Played?: boolean };
};

type PlaylistEntry = { Id: string; PlaylistItemId?: string; UserData?: { Played?: boolean } };

export type UserSummary = { added: number; removed: number; watchedRemoved: number; errors: string[] };
export type RunSummary = { users: number; added: number; removed: number; watchedRemoved: number; errors: string[] };

const isEpisodic = (type: string) => type === 'Episode' || type === 'Season' || type === 'Series';
const enc = encodeURIComponent;

function is404(error: unknown): boolean {
  return error instanceof JellyfinError && error.status === 404;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class WatchlistRunner {
  private client: JellyfinClient;
  private store: WatchlistStore;
  private serverId: string;
  private settings: WatchlistSettings;

  constructor(client: JellyfinClient, store: WatchlistStore, serverId: string) {
    this.client = client;
    this.store = store;
    this.serverId = serverId;
    this.settings = store.getSettings(serverId);
  }

  // ---------------------------------------------------------------- Jellyfin helpers

  private async userItem(userId: string, itemId: string) {
    return this.client.get<Record<string, any>>(`/Users/${enc(userId)}/Items/${enc(itemId)}`);
  }

  private async exists(userId: string, itemId: string): Promise<boolean> {
    try {
      await this.userItem(userId, itemId);
      return true;
    } catch (error) {
      if (is404(error)) return false;
      throw error;
    }
  }

  /** Rename any user-scoped item via the generic item update (the playlist rename endpoint needs a bound user). */
  private async rename(userId: string, itemId: string, name: string, sortName?: string, onlyIfDifferent = false): Promise<void> {
    const item = await this.userItem(userId, itemId);
    if (onlyIfDifferent && item.Name === name) return;
    await this.client.post(`/Items/${enc(itemId)}`, sortName ? { ...item, Name: name, ForcedSortName: sortName } : { ...item, Name: name });
  }

  private async createPlaylist(userId: string, displayName: string, sortName?: string): Promise<string> {
    // Jellyfin derives a playlist Id from its name and all users share one playlist root, so two users
    // creating the same name collide. Create with a user-qualified name, then rename.
    const created = await this.client.post<{ Id: string }>('/Playlists', {
      Name: `${displayName} (${userId})`,
      UserId: userId,
      MediaType: 'Video',
      IsPublic: false
    });
    if (!created?.Id) throw new JellyfinError('bad_response', 'Jellyfin did not return a playlist id');
    await this.rename(userId, created.Id, displayName, sortName);
    return created.Id;
  }

  private async ensureMoviesPlaylist(userId: string): Promise<string> {
    const known = this.store.getPlaylist(this.serverId, userId, 'movies');
    if (known && (await this.exists(userId, known))) return known;
    const id = await this.createPlaylist(userId, this.settings.moviesName, WATCHLIST_SORT_NAME);
    const img = this.store.getImage(this.serverId, 'movies');
    if (img) await this.client.uploadImage(id, 'Primary', img.bytes, img.contentType);
    this.store.setPlaylist(this.serverId, userId, 'movies', '', id);
    await this.ensureViewPresentation(userId).catch(() => {});
    return id;
  }

  private async ensureSeriesPlaylist(userId: string, seriesId: string, seriesName: string): Promise<string> {
    const known = this.store.getPlaylist(this.serverId, userId, 'series', seriesId);
    if (known && (await this.exists(userId, known))) return known;
    const id = await this.createPlaylist(userId, seriesName);
    for (const type of ['Primary', 'Thumb']) {
      const img = await this.client.fetchImage(seriesId, type).catch(() => null);
      if (img) await this.client.uploadImage(id, type, img.bytes, img.contentType).catch(() => {});
    }
    this.store.setPlaylist(this.serverId, userId, 'series', seriesId, id);
    await this.ensureViewPresentation(userId).catch(() => {});
    return id;
  }

  private async addToPlaylist(playlistId: string, userId: string, ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += ADD_CHUNK) {
      const chunk = ids.slice(i, i + ADD_CHUNK).join(',');
      await this.client.post(`/Playlists/${enc(playlistId)}/Items?ids=${enc(chunk)}&userId=${enc(userId)}`);
    }
  }

  private async playlistEntries(playlistId: string, userId: string): Promise<PlaylistEntry[]> {
    const data = await this.client.get<{ Items?: PlaylistEntry[] }>(`/Playlists/${enc(playlistId)}/Items?userId=${enc(userId)}&enableUserData=true`);
    return data?.Items ?? [];
  }

  private async deletePlaylist(playlistId: string): Promise<void> {
    try {
      await this.client.remove(`/Items/${enc(playlistId)}`);
    } catch (error) {
      if (!is404(error)) throw error;
    }
  }

  /** Remove one item from a playlist. Returns true when the playlist is now empty. */
  private async removeFromPlaylist(playlistId: string, userId: string, itemId: string): Promise<boolean> {
    const entries = await this.playlistEntries(playlistId, userId);
    const entry = entries.find((e) => e.Id === itemId);
    if (!entry?.PlaylistItemId) return entries.length === 0;
    await this.client.remove(`/Playlists/${enc(playlistId)}/Items?entryIds=${enc(entry.PlaylistItemId)}`);
    return entries.length <= 1;
  }

  // ---------------------------------------------------------------- favorite changes

  private async episodeIdsToAdd(userId: string, fav: SeenFavorite): Promise<string[]> {
    const data = await this.client.get<{ Items?: Array<{ Id: string; UserData?: { Played?: boolean } }> }>(
      `/Shows/${enc(fav.seriesId!)}/Episodes?userId=${enc(userId)}&Fields=UserData`
    );
    let items = data?.Items ?? [];
    if (fav.itemType === 'Episode') {
      const start = items.findIndex((i) => i.Id === fav.itemId);
      if (start !== -1) items = items.slice(start);
    }
    return items.filter((i) => !i.UserData?.Played).map((i) => i.Id);
  }

  private async onFavorited(userId: string, fav: SeenFavorite, played: boolean): Promise<boolean> {
    if (isEpisodic(fav.itemType)) {
      if (!fav.seriesId || !fav.seriesName) return false;
      const ids = await this.episodeIdsToAdd(userId, fav);
      if (ids.length === 0) return false;
      const playlistId = await this.ensureSeriesPlaylist(userId, fav.seriesId, fav.seriesName);
      await this.addToPlaylist(playlistId, userId, ids);
      return true;
    }
    if (played) return false; // already watched, nothing to queue
    const playlistId = await this.ensureMoviesPlaylist(userId);
    await this.addToPlaylist(playlistId, userId, [fav.itemId]);
    return true;
  }

  private async onUnfavorited(userId: string, fav: SeenFavorite): Promise<boolean> {
    if (isEpisodic(fav.itemType)) {
      if (!fav.seriesId) return false;
      const playlistId = this.store.getPlaylist(this.serverId, userId, 'series', fav.seriesId);
      if (!playlistId) return false;
      if (fav.itemType === 'Episode') {
        let empty: boolean;
        try {
          empty = await this.removeFromPlaylist(playlistId, userId, fav.itemId);
        } catch (error) {
          if (!is404(error)) throw error;
          this.store.removePlaylist(this.serverId, userId, 'series', fav.seriesId);
          return false;
        }
        if (empty) {
          await this.deletePlaylist(playlistId);
          this.store.removePlaylist(this.serverId, userId, 'series', fav.seriesId);
        }
      } else {
        await this.deletePlaylist(playlistId);
        this.store.removePlaylist(this.serverId, userId, 'series', fav.seriesId);
      }
      return true;
    }
    const playlistId = this.store.getPlaylist(this.serverId, userId, 'movies');
    if (!playlistId) return false;
    try {
      if (await this.removeFromPlaylist(playlistId, userId, fav.itemId)) {
        await this.deletePlaylist(playlistId);
        this.store.removePlaylist(this.serverId, userId, 'movies');
      }
    } catch (error) {
      if (!is404(error)) throw error;
      this.store.removePlaylist(this.serverId, userId, 'movies');
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- watched cleanup

  /** Remove watched entries from every playlist this tool manages for one user. */
  private async removeWatched(userId: string): Promise<number> {
    let removed = 0;
    for (const p of this.store.listPlaylists(this.serverId, userId)) {
      let entries: PlaylistEntry[];
      try {
        entries = await this.playlistEntries(p.playlistId, userId);
      } catch (error) {
        if (is404(error)) {
          // Deleted by hand in Jellyfin. Drop the stale reference so a later favorite recreates it.
          this.store.removePlaylist(this.serverId, userId, p.kind, p.seriesId);
          continue;
        }
        throw error;
      }
      const watched = entries.filter((e) => e.UserData?.Played && e.PlaylistItemId);
      if (watched.length > 0) {
        await this.client.remove(`/Playlists/${enc(p.playlistId)}/Items?entryIds=${enc(watched.map((e) => e.PlaylistItemId!).join(','))}`);
        removed += watched.length;
      }
      if (entries.length - watched.length === 0) {
        await this.deletePlaylist(p.playlistId);
        this.store.removePlaylist(this.serverId, userId, p.kind, p.seriesId);
      }
    }
    return removed;
  }

  // ---------------------------------------------------------------- presentation

  /**
   * Each user has their own "Playlists" home view once they own a playlist. Rename it, set its images and
   * move it first. Safe to repeat: every step is a no-op when already correct.
   */
  async ensureViewPresentation(userId: string): Promise<void> {
    const views = await this.client.get<{ Items?: Array<{ Id: string; CollectionType?: string }> }>(`/Users/${enc(userId)}/Views`);
    const view = (views?.Items ?? []).find((i) => i.CollectionType === 'playlists');
    if (!view) return;

    await this.rename(userId, view.Id, this.settings.viewName, undefined, true).catch(() => {});

    const img = this.store.getImage(this.serverId, 'view');
    if (img) {
      await this.client.uploadImage(view.Id, 'Primary', img.bytes, img.contentType);
      await this.client.uploadImage(view.Id, 'Thumb', img.bytes, img.contentType);
    }

    const user = await this.client.getUser(userId);
    const config = (user.Configuration ?? {}) as Record<string, unknown>;
    const ordered = Array.isArray(config.OrderedViews) ? (config.OrderedViews as string[]) : [];
    if (ordered[0] === view.Id) return;
    await this.client.setConfiguration(userId, { ...config, OrderedViews: [view.Id, ...ordered.filter((id) => id !== view.Id)] });
  }

  /**
   * Put names and images back on every managed movies playlist and every user's Playlists view.
   * Jellyfin regenerates those images on library scans, and there is no event to wait for, so the
   * caller runs this on a timer and after settings are saved.
   */
  async reapply(): Promise<{ fixed: number; failed: Array<{ playlistId: string; error: string }> }> {
    this.settings = this.store.getSettings(this.serverId);
    const failed: Array<{ playlistId: string; error: string }> = [];
    let fixed = 0;
    const users = new Set<string>();
    const img = this.store.getImage(this.serverId, 'movies');
    for (const p of this.store.listPlaylists(this.serverId)) {
      users.add(p.jfUserId);
      if (p.kind !== 'movies') continue;
      try {
        if (!(await this.exists(p.jfUserId, p.playlistId))) {
          this.store.removePlaylist(this.serverId, p.jfUserId, 'movies');
          continue;
        }
        await this.rename(p.jfUserId, p.playlistId, this.settings.moviesName, WATCHLIST_SORT_NAME, true);
        if (img) await this.client.uploadImage(p.playlistId, 'Primary', img.bytes, img.contentType);
        fixed += 1;
      } catch (error) {
        failed.push({ playlistId: p.playlistId, error: describe(error) });
      }
    }
    for (const userId of users) {
      try {
        await this.ensureViewPresentation(userId);
      } catch (error) {
        failed.push({ playlistId: `view:${userId}`, error: describe(error) });
      }
    }
    return { fixed, failed };
  }

  // ---------------------------------------------------------------- one run

  async syncUser(user: JfUser): Promise<UserSummary> {
    const summary: UserSummary = { added: 0, removed: 0, watchedRemoved: 0, errors: [] };
    const userId = user.Id;
    const favs = await this.client
      .get<{ Items?: Favorite[] }>(`/Users/${enc(userId)}/Items?Filters=IsFavorite&Recursive=true&IncludeItemTypes=${FAVORITE_TYPES}&Fields=UserData`)
      .then((d) => d?.Items ?? []);

    const seen = new Map(this.store.listSeen(this.serverId, userId).map((s) => [s.itemId, s]));
    const current = new Map(favs.map((f) => [f.Id, f]));

    for (const f of favs) {
      if (seen.has(f.Id)) continue;
      const fav: SeenFavorite = {
        itemId: f.Id,
        itemType: f.Type,
        seriesId: f.Type === 'Series' ? f.Id : (f.SeriesId ?? null),
        seriesName: f.Type === 'Series' ? f.Name : (f.SeriesName ?? null)
      };
      try {
        if (await this.onFavorited(userId, fav, f.UserData?.Played === true)) summary.added += 1;
        this.store.markSeen(this.serverId, userId, fav);
      } catch (error) {
        summary.errors.push(`${f.Name}: ${describe(error)}`); // not marked, so the next run retries
      }
    }

    for (const [itemId, fav] of seen) {
      if (current.has(itemId)) continue;
      try {
        if (await this.onUnfavorited(userId, fav)) summary.removed += 1;
        this.store.unmarkSeen(this.serverId, userId, itemId);
      } catch (error) {
        summary.errors.push(`unfavorite ${itemId}: ${describe(error)}`);
      }
    }

    try {
      summary.watchedRemoved = await this.removeWatched(userId);
    } catch (error) {
      summary.errors.push(`watched cleanup: ${describe(error)}`);
    }
    return summary;
  }

  async run(): Promise<RunSummary> {
    this.settings = this.store.getSettings(this.serverId);
    const users = (await this.client.listUsers()).filter((u) => u.Policy?.IsDisabled !== true);
    this.store.forgetUsers(this.serverId, users.map((u) => u.Id));
    const total: RunSummary = { users: users.length, added: 0, removed: 0, watchedRemoved: 0, errors: [] };
    for (const user of users) {
      try {
        const s = await this.syncUser(user);
        total.added += s.added;
        total.removed += s.removed;
        total.watchedRemoved += s.watchedRemoved;
        total.errors.push(...s.errors.map((e) => `${user.Name}: ${e}`));
      } catch (error) {
        total.errors.push(`${user.Name}: ${describe(error)}`);
      }
    }
    return total;
  }
}

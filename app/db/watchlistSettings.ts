import fs from 'fs';
import path from 'path';

/**
 * Names and images for the Watchlist playlist and the shared "Playlists" home tile.
 * Reconstruction: upstream does not commit this file.
 *
 *   names   app/db/watchlist-settings.json
 *   images  public/watchlist-movies-image.png, public/watchlist-playlists-image.png
 */

export type WatchlistSettings = {
  moviesPlaylistName: string;
  playlistsViewName: string;
};

const DEFAULT_SETTINGS: WatchlistSettings = {
  moviesPlaylistName: 'Watchlist',
  playlistsViewName: 'Playlists'
};

const DB_DIR = path.join(process.cwd(), 'app', 'db');
const SETTINGS_FILE = path.join(DB_DIR, 'watchlist-settings.json');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const MOVIES_IMAGE = path.join(PUBLIC_DIR, 'watchlist-movies-image.png');
const PLAYLISTS_IMAGE = path.join(PUBLIC_DIR, 'watchlist-playlists-image.png');

export function getWatchlistSettings(): WatchlistSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const stored = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      return { ...DEFAULT_SETTINGS, ...stored };
    }
  } catch (error) {
    console.error('Error reading watchlist-settings.json:', error);
  }

  return { ...DEFAULT_SETTINGS };
}

export function saveWatchlistSettings(update: Partial<WatchlistSettings>): WatchlistSettings {
  const next = { ...getWatchlistSettings(), ...update };

  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));

  return next;
}

function imagePathIfPresent(filePath: string): string | null {
  return fs.existsSync(filePath) ? filePath : null;
}

// The version query makes browsers refetch after an image is replaced.
function imageUrlIfPresent(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;

  return `/${path.basename(filePath)}?v=${Math.floor(fs.statSync(filePath).mtimeMs)}`;
}

function writeImage(filePath: string, bytes: Buffer) {
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(filePath, bytes);
}

export const getMoviesPlaylistImagePath = () => imagePathIfPresent(MOVIES_IMAGE);
export const getPlaylistsViewImagePath = () => imagePathIfPresent(PLAYLISTS_IMAGE);
export const getMoviesPlaylistImageUrl = () => imageUrlIfPresent(MOVIES_IMAGE);
export const getPlaylistsViewImageUrl = () => imageUrlIfPresent(PLAYLISTS_IMAGE);
export const saveMoviesPlaylistImage = (bytes: Buffer) => writeImage(MOVIES_IMAGE, bytes);
export const savePlaylistsViewImage = (bytes: Buffer) => writeImage(PLAYLISTS_IMAGE, bytes);

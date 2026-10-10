import fs from 'fs';
import path from 'path';

/**
 * The list of ratings offered on the Rate Content page and used for role rating caps.
 * Reconstruction: upstream does not commit this file. The list starts empty; add entries from
 * Content Management > Parental Ratings > Manage Ratings.
 */

export type Rating = {
  id: string;
  /** What the picker shows. */
  label: string;
  /** What gets written to the item's OfficialRating in Jellyfin. */
  value: string;
};

const DB_DIR = path.join(process.cwd(), 'app', 'db');
const RATINGS_FILE = path.join(DB_DIR, 'ratings.json');

export function getRatings(): Rating[] {
  try {
    if (fs.existsSync(RATINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(RATINGS_FILE, 'utf-8'));
      if (Array.isArray(parsed)) return parsed as Rating[];
    }
  } catch (error) {
    console.error('Error reading ratings.json:', error);
  }

  return [];
}

export function saveRatings(ratings: Rating[]): void {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(RATINGS_FILE, JSON.stringify(ratings, null, 2));
}

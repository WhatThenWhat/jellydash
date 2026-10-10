import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Shared secret required on incoming Jellyfin webhook calls.
 * Uses WEBHOOK_SECRET from the environment when set; otherwise generates one on first use and
 * stores it in app/db/webhook-secret.json. Reconstruction: upstream does not commit this file.
 */

const DB_DIR = path.join(process.cwd(), 'app', 'db');
const SECRET_FILE = path.join(DB_DIR, 'webhook-secret.json');

export function getOrCreateWebhookSecret(): string {
  const fromEnv = process.env.WEBHOOK_SECRET?.trim();
  if (fromEnv) return fromEnv;

  try {
    if (fs.existsSync(SECRET_FILE)) {
      const stored = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf-8'));
      if (typeof stored?.secret === 'string' && stored.secret) return stored.secret;
    }
  } catch (error) {
    console.error('Error reading webhook-secret.json:', error);
  }

  const secret = crypto.randomBytes(32).toString('hex');
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(SECRET_FILE, JSON.stringify({ secret }, null, 2));
  return secret;
}

export function isValidWebhookSecret(candidate: string | null | undefined): boolean {
  if (!candidate) return false;

  const expected = Buffer.from(getOrCreateWebhookSecret());
  const received = Buffer.from(candidate);

  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

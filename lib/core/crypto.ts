import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';

export function parseMasterKey(value: string | undefined): Buffer {
  if (!value) throw new Error('MASTER_KEY is not set. Generate one with: openssl rand -base64 32');
  const key = Buffer.from(value.trim(), 'base64');
  if (key.length !== 32) throw new Error('MASTER_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)');
  return key;
}

/** AES-256-GCM. `aad` binds the ciphertext to its row so values cannot be swapped between rows. */
export function encrypt(plaintext: string, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decrypt(payload: string, key: Buffer, aad: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Unsupported ciphertext format');
  const [, iv, tag, ct] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

/** Format: scrypt$N$r$p$saltB64$hashB64 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const expected = Buffer.from(hashB64, 'base64');
    const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p)
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

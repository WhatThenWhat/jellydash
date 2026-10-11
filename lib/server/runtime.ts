import { join } from 'node:path';
import { parseMasterKey } from '../core/crypto.ts';
import { openDb } from '../core/db.ts';
import { Service } from '../core/service.ts';
import { Store } from '../core/store.ts';

type Cache = { service?: Service };
const g = globalThis as unknown as { __jdMulti?: Cache };

export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');

/** True when the public URL is https. Cookies are always Secure in that case. */
export function isSecureDeployment(): boolean {
  return (process.env.PUBLIC_BASE_URL ?? '').startsWith('https://');
}

export function getService(): Service {
  const cache = (g.__jdMulti ??= {});
  if (!cache.service) {
    const key = parseMasterKey(process.env.MASTER_KEY);
    const store = new Store(openDb(join(DATA_DIR, 'jellydash.db')), key);
    cache.service = new Service(store, {
      allowInsecureHttp: process.env.ALLOW_INSECURE_HTTP === 'true'
    });
  }
  return cache.service;
}

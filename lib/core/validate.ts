import { ValidationError } from './errors.ts';

export function normalizeBaseUrl(input: string, opts: { allowHttp?: boolean } = {}): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ValidationError('Server URL is not a valid URL');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && opts.allowHttp)) {
    throw new ValidationError(
      url.protocol === 'http:'
        ? 'Server URL must use https. Set ALLOW_INSECURE_HTTP=true to permit http (not recommended).'
        : 'Server URL must start with https://'
    );
  }
  if (url.username || url.password) throw new ValidationError('Server URL must not contain credentials');
  if (url.search || url.hash) throw new ValidationError('Server URL must not contain a query string or fragment');
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

export function normalizeTags(input: unknown): string[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new ValidationError('Tags must be a list');
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') throw new ValidationError('Tags must be strings');
    const tag = raw.trim();
    if (!tag) continue;
    if (tag.length > 100) throw new ValidationError('A tag is longer than 100 characters');
    if (!out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  if (out.length > 50) throw new ValidationError('At most 50 tags are allowed');
  return out;
}

export function requireName(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${label} is required`);
  const name = value.trim();
  if (name.length > 80) throw new ValidationError(`${label} must be 80 characters or fewer`);
  return name;
}

export function optionalInt(value: unknown, label: string, min: number, max: number): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(`${label} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export function requireId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw new ValidationError(`${label} is not a valid id`);
  return value;
}

/** Jellyfin ids are 32 hex chars (no dashes) or dashed GUIDs. */
const JF_ID_RE = /^[0-9a-fA-F]{32}$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export function requireJfId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !JF_ID_RE.test(value)) throw new ValidationError(`${label} is not a valid Jellyfin id`);
  return value;
}

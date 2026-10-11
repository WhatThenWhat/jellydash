import { classifyFetchError, JellyfinError } from './errors.ts';
import { mergePolicy, policyMismatches, sanitizePatch, VERIFIED_POLICY_KEYS } from './policy.ts';

export type JfUser = {
  Id: string;
  Name: string;
  ServerId?: string;
  LastActivityDate?: string;
  LastLoginDate?: string;
  Policy?: Record<string, unknown>;
  Configuration?: Record<string, unknown>;
};

export type JfClientOptions = {
  baseUrl: string;
  apiKey?: string;
  deviceId?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  retries?: number;
};

const CLIENT_NAME = 'Jellydash';

export class JellyfinClient {
  baseUrl: string;
  private apiKey?: string;
  private deviceId: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;
  private retries: number;

  constructor(opts: JfClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
    this.deviceId = opts.deviceId ?? 'jellydash-multi';
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.retries = opts.retries ?? 2;
  }

  headers(): Record<string, string> {
    const token = this.apiKey ? `, Token="${this.apiKey}"` : '';
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': CLIENT_NAME,
      Authorization: `MediaBrowser Client="${CLIENT_NAME}", Device="${CLIENT_NAME}", DeviceId="${this.deviceId}", Version="1.0.0"${token}`
    };
  }

  /** Low-level request. GET retries on network errors and 5xx. Writes are never retried. */
  async request(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<Response> {
    const url = this.baseUrl + path;
    const attempts = method === 'GET' ? this.retries + 1 : 1;
    let lastError: JellyfinError | undefined;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers: { ...this.headers(), ...extraHeaders },
          body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
          redirect: 'manual',
          signal: AbortSignal.timeout(this.timeoutMs)
        });
        if (res.status === 401 || res.status === 403) {
          throw new JellyfinError('unauthorized', `Jellyfin rejected the API key (HTTP ${res.status})`, res.status);
        }
        if (res.status >= 300 && res.status < 400) {
          throw new JellyfinError('http', `Unexpected redirect from Jellyfin (HTTP ${res.status}). Use the final https URL.`, res.status);
        }
        if (res.status >= 500 && i < attempts - 1) {
          lastError = new JellyfinError('http', `Jellyfin returned HTTP ${res.status}`, res.status);
          await sleep(300 * (i + 1));
          continue;
        }
        return res;
      } catch (error) {
        const classified = classifyFetchError(error);
        if (classified.kind === 'unauthorized' || classified.kind === 'tls' || classified.kind === 'http') throw classified;
        lastError = classified;
        if (i < attempts - 1) await sleep(300 * (i + 1));
      }
    }
    throw lastError ?? new JellyfinError('unreachable', 'Request failed');
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.request(method, path, body);
    if (!res.ok) throw new JellyfinError('http', `Jellyfin returned HTTP ${res.status} for ${method} ${path.split('?')[0]}`, res.status);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new JellyfinError('bad_response', 'Jellyfin returned a response that is not JSON');
    }
  }

  private async none(method: string, path: string, body?: unknown): Promise<void> {
    const res = await this.request(method, path, body);
    if (!res.ok) throw new JellyfinError('http', `Jellyfin returned HTTP ${res.status} for ${method} ${path.split('?')[0]}`, res.status);
  }

  /** Generic JSON GET. Callers pass a path that is already encoded. */
  get<T>(path: string) {
    return this.json<T>('GET', path);
  }

  post<T = void>(path: string, body?: unknown) {
    return this.json<T>('POST', path, body);
  }

  remove(path: string) {
    return this.none('DELETE', path);
  }

  /** Download an item image. Returns null when the item has no such image. */
  async fetchImage(itemId: string, imageType: string, query = ''): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    const res = await this.request('GET', `/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(imageType)}${query}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new JellyfinError('http', `Jellyfin returned HTTP ${res.status} for an image`, res.status);
    return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'image/jpeg' };
  }

  /** Jellyfin base64-decodes the body of an image upload regardless of Content-Type. */
  async uploadImage(itemId: string, imageType: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const res = await this.request(
      'POST',
      `/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(imageType)}`,
      Buffer.from(bytes).toString('base64'),
      { 'Content-Type': contentType }
    );
    if (!res.ok) throw new JellyfinError('http', `Jellyfin returned HTTP ${res.status} for an image upload`, res.status);
  }

  publicInfo() {
    return this.json<{ Id?: string; ServerName?: string; Version?: string }>('GET', '/System/Info/Public');
  }

  listUsers() {
    return this.json<JfUser[]>('GET', '/Users');
  }

  getUser(id: string) {
    return this.json<JfUser>('GET', `/Users/${encodeURIComponent(id)}`);
  }

  createUser(name: string) {
    return this.json<JfUser>('POST', '/Users/New', { Name: name });
  }

  deleteUser(id: string) {
    return this.none('DELETE', `/Users/${encodeURIComponent(id)}`);
  }

  setPassword(id: string, newPassword: string) {
    return this.none('POST', `/Users/${encodeURIComponent(id)}/Password`, { CurrentPw: '', NewPw: newPassword });
  }

  setConfiguration(id: string, configuration: Record<string, unknown>) {
    return this.none('POST', `/Users/${encodeURIComponent(id)}/Configuration`, configuration);
  }

  virtualFolders() {
    return this.json<Array<{ Name: string; ItemId: string; Locations?: string[]; CollectionType?: string }>>('GET', '/Library/VirtualFolders');
  }

  /**
   * Read the current policy, apply the patch and write the merged policy back in one POST,
   * then read it again and confirm the patched fields stuck. Throws on any failure.
   */
  async applyPolicyPatch(userId: string, patch: Record<string, unknown>): Promise<void> {
    const safe = sanitizePatch(patch);
    const user = await this.getUser(userId);
    if (!user.Policy) throw new JellyfinError('bad_response', 'Jellyfin returned a user without a policy');
    const merged = mergePolicy(user.Policy, safe);
    await this.none('POST', `/Users/${encodeURIComponent(userId)}/Policy`, merged);
    const after = await this.getUser(userId);
    const checked = Object.fromEntries(Object.entries(safe).filter(([k]) => VERIFIED_POLICY_KEYS.has(k)));
    const bad = policyMismatches(after.Policy ?? {}, checked);
    if (bad.length) throw new JellyfinError('bad_response', `Policy did not apply on the server: ${bad.join(', ')}`);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

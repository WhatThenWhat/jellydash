import { ConflictError, JellyfinError, NotFoundError, ValidationError } from './errors.ts';
import { JellyfinClient, type JfUser } from './jellyfin.ts';
import { generatePassword } from './password.ts';
import { BASELINE_POLICY, groupPolicyPatch } from './policy.ts';
import type { GroupRow, ServerRow, Store } from './store.ts';
import { normalizeBaseUrl } from './validate.ts';

export type ServiceOptions = {
  allowInsecureHttp?: boolean;
  deviceId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type CreateUserResult = { user: JfUser; password: string };

export type ResolvedGroup = {
  group: { id: string; name: string; server_id: string; updated_at: string; library_ids: string[] };
  server: { id: string; name: string; jf_server_id: string | null };
  policy_patch: Record<string, unknown>;
};

export class Service {
  store: Store;
  opts: ServiceOptions;

  constructor(store: Store, opts: ServiceOptions = {}) {
    this.store = store;
    this.opts = opts;
  }

  client(server: ServerRow, apiKey?: string): JellyfinClient {
    return new JellyfinClient({
      baseUrl: server.base_url,
      apiKey: apiKey ?? this.store.getApiKey(server.id),
      deviceId: this.opts.deviceId,
      fetchImpl: this.opts.fetchImpl,
      timeoutMs: this.opts.timeoutMs
    });
  }

  clientFor(serverId: string): JellyfinClient {
    return this.client(this.store.getServer(serverId));
  }

  /** Check URL, public info and API key. Returns what Jellyfin reports. */
  async probe(baseUrl: string, apiKey: string) {
    const url = normalizeBaseUrl(baseUrl, { allowHttp: this.opts.allowInsecureHttp });
    const c = new JellyfinClient({ baseUrl: url, apiKey, deviceId: this.opts.deviceId, fetchImpl: this.opts.fetchImpl, timeoutMs: this.opts.timeoutMs });
    const info = await c.publicInfo();
    const folders = await c.virtualFolders(); // needs admin rights; 401 means the key is wrong
    return { url, jfServerId: info?.Id ?? null, serverName: info?.ServerName ?? null, version: info?.Version ?? null, libraries: folders };
  }

  async addServer(input: { name: string; baseUrl: string; apiKey: string }): Promise<ServerRow> {
    const probe = await this.probe(input.baseUrl, input.apiKey);
    if (probe.jfServerId) {
      const dup = this.store.findServerByJfId(probe.jfServerId);
      if (dup) throw new ConflictError(`That Jellyfin server is already registered as "${dup.name}"`);
    }
    const server = this.store.createServer({ name: input.name, baseUrl: probe.url, apiKey: input.apiKey, jfServerId: probe.jfServerId });
    this.store.replaceLibraries(server.id, probe.libraries.map((l) => ({ id: l.ItemId, name: l.Name })));
    return server;
  }

  async editServer(id: string, input: { name?: string; baseUrl?: string; apiKey?: string }): Promise<ServerRow> {
    const current = this.store.getServer(id);
    let jfServerId: string | null | undefined;
    let baseUrl = input.baseUrl;
    if (input.baseUrl !== undefined || input.apiKey) {
      const key = input.apiKey?.trim() || this.store.getApiKey(id);
      const probe = await this.probe(input.baseUrl ?? current.base_url, key);
      baseUrl = probe.url;
      if (current.jf_server_id && probe.jfServerId && current.jf_server_id !== probe.jfServerId) {
        throw new ValidationError('That URL points at a different Jellyfin server than the one registered');
      }
      jfServerId = probe.jfServerId ?? current.jf_server_id;
    }
    return this.store.updateServer(id, { name: input.name, baseUrl, apiKey: input.apiKey, jfServerId });
  }

  async syncLibraries(serverId: string) {
    const folders = await this.clientFor(serverId).virtualFolders();
    const result = this.store.replaceLibraries(serverId, folders.map((l) => ({ id: l.ItemId, name: l.Name })));
    return { ...result, libraries: this.store.listLibraries(serverId) };
  }

  resolveGroup(groupId: string): ResolvedGroup {
    const group = this.store.getGroup(groupId);
    const server = this.store.getServer(group.server_id);
    return {
      group: { id: group.id, name: group.name, server_id: group.server_id, updated_at: group.updated_at, library_ids: group.library_ids },
      server: { id: server.id, name: server.name, jf_server_id: server.jf_server_id },
      policy_patch: groupPolicyPatch(this.store.groupSpec(group))
    };
  }

  /**
   * Create a Jellyfin user in an access group. One merged policy write. If any step after the user
   * exists fails, the new user is deleted so no half-configured account is left behind.
   */
  async createUser(input: {
    serverId: string;
    groupId: string;
    username: string;
    password?: string;
    afterCreate?: (client: JellyfinClient, user: JfUser) => Promise<void>;
  }): Promise<CreateUserResult> {
    const username = input.username.trim();
    if (!username || username.length > 255 || /[\u0000-\u001f]/.test(username)) throw new ValidationError('Username is required (max 255 characters, no control characters)');
    const group = this.store.getGroup(input.groupId);
    if (group.server_id !== input.serverId) throw new ValidationError('Access group does not belong to this server');
    const server = this.store.getServer(input.serverId);
    const client = this.client(server);

    const existing = await client.listUsers();
    if (existing.some((u) => u.Name.toLowerCase() === username.toLowerCase())) throw new ConflictError('User already exists');

    let user: JfUser | undefined;
    try {
      user = await client.createUser(username);
    } catch (error) {
      // POST /Users/New is never retried. If the outcome is unknown, check whether the user now exists.
      if (error instanceof JellyfinError && (error.kind === 'timeout' || error.kind === 'unreachable' || error.kind === 'bad_response')) {
        const after = await client.listUsers().catch(() => []);
        user = after.find((u) => u.Name.toLowerCase() === username.toLowerCase());
      }
      if (!user) throw error;
    }
    if (!user?.Id) throw new JellyfinError('bad_response', 'Jellyfin did not return the new user');

    const password = input.password?.length ? input.password : generatePassword();
    try {
      await client.applyPolicyPatch(user.Id, { ...BASELINE_POLICY, ...groupPolicyPatch(this.store.groupSpec(group)) });
      await client.setPassword(user.Id, password);
      if (input.afterCreate) await input.afterCreate(client, user);
      this.store.recordMembership({
        serverId: server.id, groupId: group.id, groupName: group.name, jfUserId: user.Id, username, source: 'admin-ui'
      });
    } catch (error) {
      await client.deleteUser(user.Id).catch(() => undefined);
      throw error;
    }
    return { user, password };
  }

  /** Re-apply a group's current settings to one existing member. */
  async applyGroupToUser(serverId: string, groupId: string, jfUserId: string): Promise<void> {
    const group = this.store.getGroup(groupId);
    if (group.server_id !== serverId) throw new ValidationError('Access group does not belong to this server');
    await this.clientFor(serverId).applyPolicyPatch(jfUserId, groupPolicyPatch(this.store.groupSpec(group)));
  }

  groupsForServer(serverId: string): GroupRow[] {
    return this.store.listGroups(serverId);
  }

  requireServer(id: string): ServerRow {
    const s = this.store.getServer(id);
    if (!s) throw new NotFoundError('Server not found');
    return s;
  }
}

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { openDb } from '../../lib/core/db.ts';
import { JellyfinError } from '../../lib/core/errors.ts';
import { Service } from '../../lib/core/service.ts';
import { Store } from '../../lib/core/store.ts';
import { startFake, type Fake } from './fake-jellyfin.ts';

let fake: Fake;
let svc: Service;
let serverId: string;
let groupId: string;

before(async () => { fake = await startFake(); });
after(async () => { await fake.close(); });

beforeEach(async () => {
  fake.users.clear();
  fake.calls.length = 0;
  Object.assign(fake.opts, { failPolicy: false, failPassword: false, ignoreFolders: false, dropCreateResponse: false });
  const store = new Store(openDb(':memory:'), randomBytes(32));
  svc = new Service(store, { allowInsecureHttp: true, timeoutMs: 2000 });
  const server = await svc.addServer({ name: 'Lake', baseUrl: fake.url, apiKey: 'good-key' });
  serverId = server.id;
  const libs = store.listLibraries(serverId);
  const g = store.createGroup(serverId, {
    name: 'Kids', max_rating: 13, blocked_tags: ['mature'], allowed_tags: [], max_sessions: 2,
    library_ids: [libs[0].library_id], allow_downloads: false, allow_live_tv: false
  });
  groupId = g.id;
});

describe('server registry', () => {
  it('stores the Jellyfin ServerId, syncs libraries and encrypts the key', async () => {
    const s = svc.store.getServer(serverId);
    assert.equal(s.jf_server_id, 'abc123serverid');
    assert.equal(svc.store.listLibraries(serverId).length, 2);
    const raw = svc.store.db.prepare('SELECT api_key_enc FROM servers').get() as { api_key_enc: string };
    assert.ok(!raw.api_key_enc.includes('good-key'));
    assert.equal(svc.store.getApiKey(serverId), 'good-key');
  });

  it('rejects a bad key as unauthorized and a duplicate Jellyfin server', async () => {
    await assert.rejects(svc.addServer({ name: 'X', baseUrl: fake.url, apiKey: 'nope' }), (e: unknown) => e instanceof JellyfinError && e.kind === 'unauthorized');
    await assert.rejects(svc.addServer({ name: 'Other', baseUrl: fake.url, apiKey: 'good-key' }), /already registered/);
  });

  it('rejects http unless allowed', async () => {
    const strict = new Service(svc.store, {});
    await assert.rejects(strict.probe(fake.url, 'good-key'), /https/);
  });

  it('reports unreachable servers', async () => {
    await assert.rejects(svc.probe('http://127.0.0.1:1', 'k'), (e: unknown) => e instanceof JellyfinError && e.kind === 'unreachable');
  });

  it('refuses to bind ciphertext to another row', () => {
    const store = svc.store;
    const other = store.createServer({ name: 'B', baseUrl: 'https://b.example', apiKey: 'other-key', jfServerId: null });
    const a = store.db.prepare('SELECT api_key_enc FROM servers WHERE id = ?').get(other.id) as { api_key_enc: string };
    store.db.prepare('UPDATE servers SET api_key_enc = ? WHERE id = ?').run(a.api_key_enc, serverId);
    assert.throws(() => store.getApiKey(serverId));
  });
});

describe('createUser', () => {
  it('creates the user with ONE policy write that merges the group and keeps unrelated fields', async () => {
    const { user, password } = await svc.createUser({ serverId, groupId, username: 'newbie' });
    const stored = fake.users.get(user.Id)!;
    assert.equal(stored.Policy.MaxParentalRating, 13);
    assert.deepEqual(stored.Policy.BlockedTags, ['mature']);
    assert.equal(stored.Policy.EnableAllFolders, false);
    assert.equal((stored.Policy.EnabledFolders as string[]).length, 1);
    assert.equal(stored.Policy.Custom, 'keep');
    assert.equal(stored.Policy.IsAdministrator, false);
    assert.equal(stored.Password, password);
    assert.equal(fake.calls.filter((c) => c === `POST /Users/${user.Id}/Policy`).length, 1);
    assert.equal(svc.store.listMemberships(serverId).length, 1);
  });

  it('deletes the new user when the policy write fails', async () => {
    fake.opts.failPolicy = true;
    await assert.rejects(svc.createUser({ serverId, groupId, username: 'x1' }));
    assert.equal(fake.users.size, 0);
    assert.equal(svc.store.listMemberships(serverId).length, 0);
  });

  it('deletes the new user when the policy does not stick', async () => {
    fake.opts.ignoreFolders = true;
    await assert.rejects(svc.createUser({ serverId, groupId, username: 'x2' }), /did not apply/);
    assert.equal(fake.users.size, 0);
  });

  it('deletes the new user when the password step fails', async () => {
    fake.opts.failPassword = true;
    await assert.rejects(svc.createUser({ serverId, groupId, username: 'x3' }));
    assert.equal(fake.users.size, 0);
  });

  it('runs afterCreate and rolls back if it throws', async () => {
    await assert.rejects(svc.createUser({ serverId, groupId, username: 'x4', afterCreate: async () => { throw new Error('boom'); } }), /boom/);
    assert.equal(fake.users.size, 0);
  });

  it('finds the user after a lost create response instead of retrying the POST', async () => {
    fake.opts.dropCreateResponse = true;
    const { user } = await svc.createUser({ serverId, groupId, username: 'lost' });
    assert.equal(fake.calls.filter((c) => c === 'POST /Users/New').length, 1);
    assert.equal(fake.users.get(user.Id)?.Name, 'lost');
  });

  it('rejects duplicate names case-insensitively and cross-server groups', async () => {
    await svc.createUser({ serverId, groupId, username: 'Dup' });
    await assert.rejects(svc.createUser({ serverId, groupId, username: 'dup' }), /already exists/);
    const store = svc.store;
    const s2 = store.createServer({ name: 'Condo', baseUrl: 'https://c.example', apiKey: 'k', jfServerId: 'zzz' });
    await assert.rejects(svc.createUser({ serverId: s2.id, groupId, username: 'q' }), /does not belong/);
  });
});

describe('policy safety', () => {
  it('never grants admin or all folders', async () => {
    const { user } = await svc.createUser({ serverId, groupId, username: 'safe' });
    const c = svc.clientFor(serverId);
    await assert.rejects(c.applyPolicyPatch(user.Id, { IsAdministrator: true }), /administrator/);
    await assert.rejects(c.applyPolicyPatch(user.Id, { EnableAllFolders: true }), /all folders/);
    await assert.rejects(c.applyPolicyPatch(user.Id, { Bogus: 1 }), /not allowed/);
  });
});

describe('groups', () => {
  it('resolve returns the patch and server identity', () => {
    const r = svc.resolveGroup(groupId);
    assert.equal(r.server.jf_server_id, 'abc123serverid');
    assert.equal(r.policy_patch.MaxParentalRating, 13);
    assert.equal(r.policy_patch.EnableAllFolders, false);
  });

  it('deleting a group keeps memberships and does not touch Jellyfin', async () => {
    await svc.createUser({ serverId, groupId, username: 'keep' });
    svc.store.deleteGroup(groupId);
    const m = svc.store.listMemberships(serverId);
    assert.equal(m.length, 1);
    assert.equal(m[0].group_id, null);
    assert.equal(m[0].group_name, 'Kids');
    assert.equal(fake.users.size, 1);
  });

  it('rejects libraries that are not in the catalog and empty rating means no cap', () => {
    assert.throws(() => svc.store.createGroup(serverId, { name: 'Bad', library_ids: ['zzz'] }), /Sync first/);
    const g = svc.store.createGroup(serverId, { name: 'Open', library_ids: [] });
    assert.equal(g.max_rating, null);
    assert.equal(svc.resolveGroup(g.id).policy_patch.MaxParentalRating, null);
  });

  it('sync drops removed libraries from groups', async () => {
    svc.store.replaceLibraries(serverId, [{ id: 'c'.repeat(32), name: 'Other' }]);
    assert.deepEqual(svc.store.getGroup(groupId).library_ids, []);
  });
});

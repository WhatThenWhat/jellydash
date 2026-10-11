import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { openDb } from '../../lib/core/db.ts';
import { Service } from '../../lib/core/service.ts';
import { Store } from '../../lib/core/store.ts';
import { WatchlistRunner } from '../../lib/core/watchlist.ts';
import { WatchlistStore, sniffImage } from '../../lib/core/watchlistStore.ts';
import { startFake, type Fake, type FakeUser } from './fake-jellyfin.ts';

let fake: Fake;
let svc: Service;
let ws: WatchlistStore;
let serverId: string;
let alice: FakeUser;
let bob: FakeUser;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

before(async () => { fake = await startFake(); });
after(async () => { await fake.close(); });

beforeEach(async () => {
  fake.users.clear(); fake.catalog.clear(); fake.played.clear(); fake.favorites.clear();
  fake.playlists.clear(); fake.names.clear(); fake.images.clear(); fake.calls.length = 0; fake.opts.failPlaylistAdd = false;
  const store = new Store(openDb(':memory:'), randomBytes(32));
  svc = new Service(store, { allowInsecureHttp: true, timeoutMs: 2000 });
  serverId = (await svc.addServer({ name: 'Lake', baseUrl: fake.url, apiKey: 'good-key' })).id;
  ws = new WatchlistStore(store.db);
  ws.saveSettings(serverId, { enabled: true });
  alice = fake.addUser('alice');
  bob = fake.addUser('bob');
});

const runner = () => new WatchlistRunner(svc.clientFor(serverId), ws, serverId);
const fav = (u: FakeUser, id: string) => { if (!fake.favorites.has(u.Id)) fake.favorites.set(u.Id, new Set()); fake.favorites.get(u.Id)!.add(id); };
const unfav = (u: FakeUser, id: string) => fake.favorites.get(u.Id)?.delete(id);
const playlistsOf = (u: FakeUser) => [...fake.playlists.values()].filter((p) => p.Owner === u.Id);

function series(episodes = 3) {
  const s = fake.addItem({ Name: 'Show A', Type: 'Series' });
  const eps = Array.from({ length: episodes }, (_, i) => fake.addItem({ Name: `E${i + 1}`, Type: 'Episode', SeriesId: s.Id, SeriesName: s.Name, Index: i + 1 }));
  return { s, eps };
}

describe('movies', () => {
  it('backfills an existing favorite into one Watchlist playlist and does nothing on the second run', async () => {
    const m = fake.addItem({ Name: 'Movie One', Type: 'Movie' });
    fav(alice, m.Id);
    const first = await runner().run();
    assert.equal(first.added, 1);
    assert.deepEqual(first.errors, []);
    const [pl] = playlistsOf(alice);
    assert.equal(fake.names.get(pl.Id), 'Watchlist');
    assert.deepEqual(pl.entries.map((e) => e.itemId), [m.Id]);
    const writes = fake.calls.length;
    const second = await runner().run();
    assert.equal(second.added, 0);
    assert.equal(playlistsOf(alice).length, 1);
    assert.ok(fake.calls.slice(writes).every((c) => c.startsWith('GET')), 'second run only reads');
  });

  it('keeps users separate', async () => {
    const m = fake.addItem({ Name: 'Movie One', Type: 'Movie' });
    fav(alice, m.Id);
    await runner().run();
    assert.equal(playlistsOf(alice).length, 1);
    assert.equal(playlistsOf(bob).length, 0);
  });

  it('removes the item on unfavorite and deletes the empty playlist', async () => {
    const m = fake.addItem({ Name: 'Movie One', Type: 'Movie' });
    fav(alice, m.Id);
    await runner().run();
    unfav(alice, m.Id);
    const r = await runner().run();
    assert.equal(r.removed, 1);
    assert.equal(playlistsOf(alice).length, 0);
    assert.equal(ws.getPlaylist(serverId, alice.Id, 'movies'), undefined);
  });

  it('removes watched movies and deletes the playlist when it empties, without re-adding', async () => {
    const m1 = fake.addItem({ Name: 'Movie One', Type: 'Movie' });
    const m2 = fake.addItem({ Name: 'Movie Two', Type: 'Movie' });
    fav(alice, m1.Id); fav(alice, m2.Id);
    await runner().run();
    fake.played.add(`${alice.Id}:${m1.Id}`);
    const r = await runner().run();
    assert.equal(r.watchedRemoved, 1);
    assert.deepEqual(playlistsOf(alice)[0].entries.map((e) => e.itemId), [m2.Id]);
    fake.played.add(`${alice.Id}:${m2.Id}`);
    await runner().run();
    assert.equal(playlistsOf(alice).length, 0);
    await runner().run();
    assert.equal(playlistsOf(alice).length, 0, 'favorites stay seen, so nothing is re-added');
  });

  it('skips a favorite that is already watched', async () => {
    const m = fake.addItem({ Name: 'Movie One', Type: 'Movie' });
    fav(alice, m.Id);
    fake.played.add(`${alice.Id}:${m.Id}`);
    const r = await runner().run();
    assert.equal(r.added, 0);
    assert.equal(playlistsOf(alice).length, 0);
  });

  it('recreates a playlist that was deleted by hand', async () => {
    const m1 = fake.addItem({ Name: 'Movie One', Type: 'Movie' });
    fav(alice, m1.Id);
    await runner().run();
    fake.playlists.clear();
    const m2 = fake.addItem({ Name: 'Movie Two', Type: 'Movie' });
    fav(alice, m2.Id);
    await runner().run();
    const [pl] = playlistsOf(alice);
    assert.deepEqual(pl.entries.map((e) => e.itemId), [m2.Id]);
  });
});

describe('series', () => {
  it('favoriting a series queues unwatched episodes in a playlist named after it', async () => {
    const { s, eps } = series(3);
    fake.played.add(`${alice.Id}:${eps[0].Id}`);
    fav(alice, s.Id);
    await runner().run();
    const [pl] = playlistsOf(alice);
    assert.equal(fake.names.get(pl.Id), 'Show A');
    assert.deepEqual(pl.entries.map((e) => e.itemId), [eps[1].Id, eps[2].Id]);
  });

  it('favoriting an episode queues it and the ones after it', async () => {
    const { eps } = series(4);
    fav(alice, eps[1].Id);
    await runner().run();
    assert.deepEqual(playlistsOf(alice)[0].entries.map((e) => e.itemId), [eps[1].Id, eps[2].Id, eps[3].Id]);
  });

  it('does not create an empty playlist when every episode is watched', async () => {
    const { s, eps } = series(2);
    eps.forEach((e) => fake.played.add(`${alice.Id}:${e.Id}`));
    fav(alice, s.Id);
    const r = await runner().run();
    assert.equal(playlistsOf(alice).length, 0);
    assert.deepEqual(r.errors, []);
  });

  it('removes watched episodes and drops the playlist after the last one', async () => {
    const { s, eps } = series(2);
    fav(alice, s.Id);
    await runner().run();
    fake.played.add(`${alice.Id}:${eps[0].Id}`);
    await runner().run();
    assert.equal(playlistsOf(alice)[0].entries.length, 1);
    fake.played.add(`${alice.Id}:${eps[1].Id}`);
    await runner().run();
    assert.equal(playlistsOf(alice).length, 0);
  });

  it('unfavoriting the series deletes its playlist', async () => {
    const { s } = series(2);
    fav(alice, s.Id);
    await runner().run();
    unfav(alice, s.Id);
    await runner().run();
    assert.equal(playlistsOf(alice).length, 0);
  });

  it('copies the series images to the playlist when present', async () => {
    const { s } = series(1);
    fake.images.set(`${s.Id}:Primary`, Buffer.from(PNG).toString('base64'));
    fav(alice, s.Id);
    await runner().run();
    const [pl] = playlistsOf(alice);
    assert.equal(fake.images.get(`${pl.Id}:Primary`), Buffer.from(PNG).toString('base64'));
    assert.equal(fake.images.has(`${pl.Id}:Thumb`), false);
  });
});

describe('presentation and settings', () => {
  it('applies the custom name and images to the playlist and the Playlists view, and puts the view first', async () => {
    ws.saveSettings(serverId, { moviesName: 'Queue', viewName: 'My Lists' });
    ws.saveImage(serverId, 'movies', PNG);
    ws.saveImage(serverId, 'view', PNG);
    const m = fake.addItem({ Name: 'Movie One', Type: 'Movie' });
    fav(alice, m.Id);
    await runner().run();
    const [pl] = playlistsOf(alice);
    const b64 = Buffer.from(PNG).toString('base64');
    assert.equal(fake.names.get(pl.Id), 'Queue');
    assert.equal(fake.images.get(`${pl.Id}:Primary`), b64);
    const view = 'd' + alice.Id.slice(1);
    assert.equal(fake.names.get(view), 'My Lists');
    assert.equal(fake.images.get(`${view}:Primary`), b64);
    assert.equal(fake.images.get(`${view}:Thumb`), b64);
    assert.deepEqual((alice.Config as any).OrderedViews, [view]);
  });

  it('reapply restores a name and image Jellyfin changed', async () => {
    ws.saveImage(serverId, 'movies', PNG);
    const m = fake.addItem({ Name: 'Movie One', Type: 'Movie' });
    fav(alice, m.Id);
    await runner().run();
    const [pl] = playlistsOf(alice);
    fake.names.set(pl.Id, 'Something else');
    fake.images.delete(`${pl.Id}:Primary`);
    const r = await runner().reapply();
    assert.equal(r.fixed, 1);
    assert.deepEqual(r.failed, []);
    assert.equal(fake.names.get(pl.Id), 'Watchlist');
    assert.ok(fake.images.has(`${pl.Id}:Primary`));
  });

  it('validates names and images', () => {
    assert.throws(() => ws.saveSettings(serverId, { moviesName: '   ' }), /required/);
    assert.throws(() => ws.saveSettings(serverId, { viewName: 'x'.repeat(101) }), /100/);
    assert.throws(() => ws.saveSettings(serverId, { viewName: 'bad\u0007name' }), /control/);
    assert.throws(() => ws.saveImage(serverId, 'movies', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), /PNG or JPEG/);
    assert.throws(() => ws.saveImage(serverId, 'movies', new Uint8Array(0)), /empty/);
    assert.throws(() => ws.saveImage(serverId, 'movies', new Uint8Array(2 * 1024 * 1024 + 1).fill(0xff)), /2 MB/);
    assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
    assert.equal(sniffImage(new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x3e, 0, 0, 0, 0])), null);
  });
});

describe('robustness', () => {
  it('skips disabled users', async () => {
    const m = fake.addItem({ Name: 'Movie One', Type: 'Movie' });
    fav(bob, m.Id);
    bob.Policy.IsDisabled = true;
    const r = await runner().run();
    assert.equal(r.users, 1);
    assert.equal(playlistsOf(bob).length, 0);
  });

  it('retries a failed favorite on the next run', async () => {
    const m = fake.addItem({ Name: 'Movie One', Type: 'Movie' });
    fav(alice, m.Id);
    fake.opts.failPlaylistAdd = true;
    try {
      const first = await runner().run();
      assert.equal(first.added, 0);
      assert.ok(first.errors.length > 0);
      assert.equal(ws.listSeen(serverId, alice.Id).length, 0, 'a failed favorite is not marked as handled');
    } finally {
      fake.opts.failPlaylistAdd = false;
    }
    await runner().run();
    assert.deepEqual(playlistsOf(alice).flatMap((p) => p.entries.map((e) => e.itemId)), [m.Id]);
  });

  it('forgets users that no longer exist', async () => {
    const m = fake.addItem({ Name: 'Movie One', Type: 'Movie' });
    fav(alice, m.Id);
    await runner().run();
    fake.users.delete(alice.Id);
    await runner().run();
    assert.equal(ws.listSeen(serverId, alice.Id).length, 0);
    assert.equal(ws.listPlaylists(serverId, alice.Id).length, 0);
  });
});

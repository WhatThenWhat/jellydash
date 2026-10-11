import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { loadRatableItems, pageOf, ratableLibraries, searchRatable, sortForRating, updateRatings } from '../../lib/core/content.ts';
import { openDb } from '../../lib/core/db.ts';
import { Service } from '../../lib/core/service.ts';
import { Store } from '../../lib/core/store.ts';
import { startFake, type Fake } from './fake-jellyfin.ts';

let fake: Fake;
let svc: Service;
let serverId: string;
const LIB = 'a'.repeat(32);
const choices = [{ value: 'G' }, { value: 'PG' }, { value: 'R' }];

before(async () => { fake = await startFake(); });
after(async () => { await fake.close(); });

beforeEach(async () => {
  fake.users.clear(); fake.catalog.clear(); fake.calls.length = 0;
  svc = new Service(new Store(openDb(':memory:'), randomBytes(32)), { allowInsecureHttp: true, timeoutMs: 2000 });
  serverId = (await svc.addServer({ name: 'Lake', baseUrl: fake.url, apiKey: 'good-key' })).id;
  fake.addUser('admin', true);
});

const client = () => svc.clientFor(serverId);
const add = (name: string, type: string, date: string, rating?: string) =>
  fake.addItem({ Name: name, Type: type, ParentId: LIB, DateCreated: date, OfficialRating: rating });

describe('listing', () => {
  it('puts unrated titles first, newest first inside each group, and pages the result', async () => {
    add('Old rated', 'Movie', '2020-01-01T00:00:00Z', 'PG');
    add('New rated', 'Movie', '2024-01-01T00:00:00Z', 'G');
    add('Old unrated', 'Series', '2021-01-01T00:00:00Z');
    add('New unknown', 'Movie', '2025-01-01T00:00:00Z', 'TV-XX');
    const items = await loadRatableItems(client());
    assert.deepEqual(sortForRating(items, choices).map((i) => i.Name), ['New unknown', 'Old unrated', 'New rated', 'Old rated']);
    const page = pageOf(items, choices, 1, 3);
    assert.equal(page.Items.length, 1);
    assert.equal(page.TotalRecordCount, 4);
    assert.equal(page.TotalPages, 2);
    assert.equal(page.MovieCount, 3);
    assert.equal(page.SeriesCount, 1);
  });

  it('matches ratings ignoring case and spaces', () => {
    const items = [{ Id: '1', Name: 'a', Type: 'Movie', OfficialRating: ' pg ' }, { Id: '2', Name: 'b', Type: 'Movie' }];
    assert.deepEqual(sortForRating(items, choices).map((i) => i.Id), ['2', '1']);
  });

  it('uses movie, tv and mixed libraries only', () => {
    const kept = ratableLibraries([
      { Name: 'M', ItemId: '1', CollectionType: 'movies' },
      { Name: 'T', ItemId: '2', CollectionType: 'tvshows' },
      { Name: 'X', ItemId: '3' },
      { Name: 'Music', ItemId: '4', CollectionType: 'music' },
      { Name: 'Books', ItemId: '5', CollectionType: 'books' }
    ]);
    assert.deepEqual(kept.map((f) => f.Name), ['M', 'T', 'X']);
  });

  it('searches by name', async () => {
    add('Alpha', 'Movie', '2020-01-01T00:00:00Z');
    add('Beta', 'Movie', '2020-01-01T00:00:00Z');
    assert.deepEqual((await searchRatable(client(), 'alp')).map((i) => i.Name), ['Alpha']);
  });
});

describe('updating ratings', () => {
  it('writes the rating, locks the field and keeps existing locks', async () => {
    const it1 = add('One', 'Movie', '2020-01-01T00:00:00Z');
    it1.LockedFields = ['Name'];
    const r = await updateRatings(client(), [{ ItemId: it1.Id, Rating: 'pg' }], choices);
    assert.deepEqual(r, { updated: 1, failed: [] });
    assert.equal(fake.catalog.get(it1.Id)!.OfficialRating, 'PG');
    assert.deepEqual([...fake.catalog.get(it1.Id)!.LockedFields!].sort(), ['Name', 'OfficialRating']);
  });

  it('rejects a rating that is not configured and a bad item id, before writing anything', async () => {
    const it1 = add('One', 'Movie', '2020-01-01T00:00:00Z');
    await assert.rejects(updateRatings(client(), [{ ItemId: it1.Id, Rating: 'NC-17' }], choices), /not one of the configured/);
    await assert.rejects(updateRatings(client(), [{ ItemId: '../etc', Rating: 'G' }], choices), /item id/);
    await assert.rejects(updateRatings(client(), [{ ItemId: it1.Id, Rating: 5 }], choices), /text/);
    assert.equal(fake.catalog.get(it1.Id)!.OfficialRating, undefined);
    assert.ok(!fake.calls.some((c) => c.startsWith('POST /Items')));
  });

  it('reports items that fail and continues with the rest', async () => {
    const good = add('Good', 'Movie', '2020-01-01T00:00:00Z');
    const missing = 'c'.repeat(32);
    const r = await updateRatings(client(), [{ ItemId: missing, Rating: 'G' }, { ItemId: good.Id, Rating: 'G' }], choices);
    assert.equal(r.updated, 1);
    assert.equal(r.failed.length, 1);
    assert.equal(r.failed[0].id, missing);
  });

  it('needs an enabled administrator account', async () => {
    fake.users.clear();
    fake.addUser('plain', false);
    const it1 = add('One', 'Movie', '2020-01-01T00:00:00Z');
    await assert.rejects(updateRatings(client(), [{ ItemId: it1.Id, Rating: 'G' }], choices), /administrator/);
  });
});

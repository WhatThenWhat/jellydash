import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { loadRatableItems, NEEDS_RATING, pageOf, ratableLibraries, searchRatable, sortForRating, tagPageOf, updateRatings, updateTags } from '../../lib/core/content.ts';
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

  it('filters by rating, or by titles that still need one', async () => {
    add('A', 'Movie', '2020-01-01T00:00:00Z', 'PG');
    add('B', 'Movie', '2021-01-01T00:00:00Z', ' pg ');
    add('C', 'Movie', '2022-01-01T00:00:00Z', 'G');
    add('D', 'Series', '2023-01-01T00:00:00Z');
    add('E', 'Movie', '2024-01-01T00:00:00Z', 'TV-XX');
    const items = await loadRatableItems(client());
    assert.deepEqual(pageOf(items, choices, 0, 10, 'PG').Items.map((i) => i.Name).sort(), ['A', 'B']);
    assert.deepEqual(pageOf(items, choices, 0, 10, 'g').Items.map((i) => i.Name), ['C']);
    const needs = pageOf(items, choices, 0, 10, NEEDS_RATING);
    assert.deepEqual(needs.Items.map((i) => i.Name), ['E', 'D']);
    assert.equal(needs.TotalRecordCount, 2);
    assert.equal(needs.SeriesCount, 1);
    assert.equal(pageOf(items, choices, 0, 10).TotalRecordCount, 5);
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

  it('clears a rating with an empty value and keeps the field locked', async () => {
    const it1 = add('One', 'Movie', '2020-01-01T00:00:00Z', 'PG');
    const r = await updateRatings(client(), [{ ItemId: it1.Id, Rating: '' }], choices);
    assert.deepEqual(r, { updated: 1, failed: [] });
    assert.equal(fake.catalog.get(it1.Id)!.OfficialRating, '');
    assert.ok(fake.catalog.get(it1.Id)!.LockedFields!.includes('OfficialRating'));
    const items = await loadRatableItems(client());
    assert.equal(pageOf(items, choices, 0, 10, NEEDS_RATING).TotalRecordCount, 1);
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

describe('tag content', () => {
  const managed = ['hold', 'family'];

  it('adds a tag, keeps existing tags, locks the field and verifies the result', async () => {
    const it1 = add('One', 'Movie', '2020-01-01T00:00:00Z');
    it1.Tags = ['Action'];
    it1.LockedFields = ['Name'];
    const r = await updateTags(client(), [{ ItemId: it1.Id, Add: ['HOLD'] }], managed);
    assert.deepEqual(r, { updated: 1, unchanged: 0, failed: [] });
    assert.deepEqual(fake.catalog.get(it1.Id)!.Tags, ['Action', 'hold']);
    assert.deepEqual([...fake.catalog.get(it1.Id)!.LockedFields!].sort(), ['Name', 'Tags']);
  });

  it('removes only the named tag, ignoring case, and leaves the rest', async () => {
    const it1 = add('One', 'Movie', '2020-01-01T00:00:00Z');
    it1.Tags = ['Hold', 'Action'];
    const r = await updateTags(client(), [{ ItemId: it1.Id, Remove: ['hold'] }], managed);
    assert.equal(r.updated, 1);
    assert.deepEqual(fake.catalog.get(it1.Id)!.Tags, ['Action']);
  });

  it('does not write when nothing changes', async () => {
    const it1 = add('One', 'Movie', '2020-01-01T00:00:00Z');
    it1.Tags = ['hold'];
    const r = await updateTags(client(), [{ ItemId: it1.Id, Add: ['hold'] }, { ItemId: it1.Id, Remove: ['family'] }], managed);
    assert.deepEqual(r, { updated: 0, unchanged: 2, failed: [] });
    assert.ok(!fake.calls.some((c) => c.startsWith('POST /Items')));
  });

  it('rejects unmanaged tags, conflicting add and remove, and bad ids before writing anything', async () => {
    const it1 = add('One', 'Movie', '2020-01-01T00:00:00Z');
    await assert.rejects(updateTags(client(), [{ ItemId: it1.Id, Add: ['mature'] }], managed), /Manage Tags/);
    await assert.rejects(updateTags(client(), [{ ItemId: it1.Id, Add: ['hold'], Remove: ['hold'] }], managed), /added and removed/);
    await assert.rejects(updateTags(client(), [{ ItemId: '../etc', Add: ['hold'] }], managed), /item id/);
    assert.ok(!fake.calls.some((c) => c.startsWith('POST /Items')));
  });

  it('reports a failed read-back instead of claiming success', async () => {
    const it1 = add('One', 'Movie', '2020-01-01T00:00:00Z');
    const original = fake.catalog.get(it1.Id)!;
    Object.defineProperty(original, 'Tags', { get: () => [], set: () => undefined, configurable: true, enumerable: true });
    const r = await updateTags(client(), [{ ItemId: it1.Id, Add: ['hold'] }], managed);
    assert.equal(r.updated, 0);
    assert.match(r.failed[0].error, /did not keep/);
  });

  it('lists titles newest first and filters by tag', () => {
    const items = [
      { Id: 'a', Name: 'Old', Type: 'Movie', DateCreated: '2019-01-01T00:00:00Z', Tags: ['Hold'] },
      { Id: 'b', Name: 'New', Type: 'Series', DateCreated: '2023-01-01T00:00:00Z', Tags: [] },
      { Id: 'c', Name: 'Mid', Type: 'Movie', DateCreated: '2021-01-01T00:00:00Z' }
    ];
    assert.deepEqual(tagPageOf(items, {}, 0, 10).Items.map((i) => i.Name), ['New', 'Mid', 'Old']);
    assert.deepEqual(tagPageOf(items, { tag: 'hold', has: true }, 0, 10).Items.map((i) => i.Name), ['Old']);
    const without = tagPageOf(items, { tag: 'hold', has: false }, 0, 10);
    assert.deepEqual(without.Items.map((i) => i.Name), ['New', 'Mid']);
    assert.equal(without.MovieCount, 1);
    assert.equal(without.SeriesCount, 1);
  });

  it('loads tags with the title list', async () => {
    const it1 = add('One', 'Movie', '2020-01-01T00:00:00Z');
    it1.Tags = ['hold'];
    const items = await loadRatableItems(client());
    assert.deepEqual(items[0].Tags, ['hold']);
    assert.ok(fake.calls.length > 0);
  });
});

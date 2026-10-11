import { createServer, type IncomingMessage, type Server } from 'node:http';

export type FakeUser = { Id: string; Name: string; Policy: Record<string, unknown>; Password?: string; Config?: Record<string, unknown> };
export type FakeItem = {
  Id: string; Name: string; Type: string; SeriesId?: string; SeriesName?: string; ParentId?: string; Index?: number;
  DateCreated?: string; OfficialRating?: string; LockedFields?: string[]; Tags?: string[];
};
export type FakePlaylist = { Id: string; Name: string; Owner: string; entries: Array<{ entryId: string; itemId: string }> };

export type Fake = {
  server: Server;
  url: string;
  users: Map<string, FakeUser>;
  calls: string[];
  catalog: Map<string, FakeItem>;
  played: Set<string>; // `${userId}:${itemId}`
  favorites: Map<string, Set<string>>;
  playlists: Map<string, FakePlaylist>;
  names: Map<string, string>; // renamed views
  images: Map<string, string>; // `${itemId}:${type}` -> base64 body
  addUser(name: string, admin?: boolean): FakeUser;
  addItem(item: Omit<FakeItem, 'Id'> & { Id?: string }): FakeItem;
  opts: { failPlaylistAdd: boolean; failPolicy: boolean; failPassword: boolean; goodKey: string; ignoreFolders: boolean; dropCreateResponse: boolean };
  close(): Promise<void>;
};

function body(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve(undefined);
      try { resolve(JSON.parse(data)); } catch { resolve(data); } // image uploads are raw base64 text
    });
  });
}

export async function startFake(): Promise<Fake> {
  const users = new Map<string, FakeUser>();
  const calls: string[] = [];
  const opts = { failPlaylistAdd: false, failPolicy: false, failPassword: false, goodKey: 'good-key', ignoreFolders: false, dropCreateResponse: false };
  const catalog = new Map<string, FakeItem>();
  const played = new Set<string>();
  const favorites = new Map<string, Set<string>>();
  const playlists = new Map<string, FakePlaylist>();
  const names = new Map<string, string>();
  const images = new Map<string, string>();
  let n = 0;
  let m2 = 0;
  const hex = (prefix: string, i: number) => prefix + i.toString(16).padStart(31, '0');
  const addUser = (name: string, admin = false): FakeUser => {
    const id = (++n).toString(16).padStart(32, '0');
    const u: FakeUser = { Id: id, Name: name, Policy: { IsAdministrator: admin, IsDisabled: false, EnableAllFolders: true, EnabledFolders: [] }, Config: {} };
    users.set(id, u);
    return u;
  };
  const addItem = (item: Omit<FakeItem, 'Id'> & { Id?: string }): FakeItem => {
    const full: FakeItem = { ...item, Id: item.Id ?? hex('f', ++m2) };
    catalog.set(full.Id, full);
    return full;
  };
  const viewId = (uid: string) => 'd' + uid.slice(1);
  const ownsPlaylist = (uid: string) => [...playlists.values()].some((p) => p.Owner === uid);
  const dto = (uid: string, it: FakeItem) => ({ ...it, UserData: { Played: played.has(`${uid}:${it.Id}`), IsFavorite: !!favorites.get(uid)?.has(it.Id) } });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    calls.push(`${req.method} ${url.pathname}`);
    const send = (status: number, obj?: unknown) => {
      res.statusCode = status;
      if (obj !== undefined) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); } else res.end();
    };
    if (url.pathname === '/System/Info/Public') return send(200, { Id: 'abc123serverid', ServerName: 'Fake', Version: '10.10.0' });
    const auth = req.headers['authorization'] ?? '';
    if (!String(auth).includes(`Token="${opts.goodKey}"`)) return send(401);
    const b = await body(req);
    if (url.pathname === '/Library/VirtualFolders') return send(200, [{ Name: 'Movies', ItemId: 'a'.repeat(32) }, { Name: 'Shows', ItemId: 'b'.repeat(32) }]);
    if (url.pathname === '/Users' && req.method === 'GET') return send(200, [...users.values()].map(({ Id, Name, Policy }) => ({ Id, Name, Policy })));
    if (url.pathname === '/Users/New') {
      const id = (++n).toString(16).padStart(32, '0');
      users.set(id, { Id: id, Name: b.Name, Policy: { IsAdministrator: false, EnableAllFolders: true, EnabledFolders: [], Custom: 'keep' } });
      if (opts.dropCreateResponse) { res.destroy(); return; }
      return send(200, { Id: id, Name: b.Name });
    }
    // ---- library, favorites, playlists ----
    let r: RegExpMatchArray | null;
    if (url.pathname === '/Items' && req.method === 'GET') {
      const parent = url.searchParams.get('ParentId');
      const term = url.searchParams.get('SearchTerm')?.toLowerCase();
      const types = url.searchParams.get('IncludeItemTypes')?.split(',');
      const items = [...catalog.values()].filter((i) => (!parent || i.ParentId === parent) && (!term || i.Name.toLowerCase().includes(term)) && (!types || types.includes(i.Type)));
      return send(200, { Items: items, TotalRecordCount: items.length });
    }
    if ((r = url.pathname.match(/^\/Users\/([0-9a-f]{32})\/Items$/)) && req.method === 'GET') {
      const uid = r[1];
      if (!users.has(uid)) return send(404);
      const favs = [...(favorites.get(uid) ?? [])].map((id) => catalog.get(id)).filter((x): x is FakeItem => !!x);
      return send(200, { Items: favs.map((i) => dto(uid, i)), TotalRecordCount: favs.length });
    }
    if ((r = url.pathname.match(/^\/Users\/([0-9a-f]{32})\/Items\/([0-9a-f]{32})$/)) && req.method === 'GET') {
      const [, uid, id] = r;
      const pl = playlists.get(id);
      if (pl) return send(200, { Id: id, Name: names.get(id) ?? pl.Name, Type: 'Playlist' });
      if (id === viewId(uid) && ownsPlaylist(uid)) return send(200, { Id: id, Name: names.get(id) ?? 'Playlists', CollectionType: 'playlists' });
      const it = catalog.get(id);
      return it ? send(200, dto(uid, it)) : send(404);
    }
    if ((r = url.pathname.match(/^\/Users\/([0-9a-f]{32})\/Views$/))) {
      const uid = r[1];
      return send(200, { Items: ownsPlaylist(uid) ? [{ Id: viewId(uid), Name: names.get(viewId(uid)) ?? 'Playlists', CollectionType: 'playlists' }] : [] });
    }
    if ((r = url.pathname.match(/^\/Shows\/([0-9a-f]{32})\/Episodes$/))) {
      const uid = url.searchParams.get('userId') ?? '';
      const eps = [...catalog.values()].filter((i) => i.SeriesId === r![1] && i.Type === 'Episode').sort((a, b) => (a.Index ?? 0) - (b.Index ?? 0));
      return send(200, { Items: eps.map((i) => dto(uid, i)) });
    }
    if (url.pathname === '/Playlists' && req.method === 'POST') {
      const id = hex('e', ++m2);
      playlists.set(id, { Id: id, Name: b.Name, Owner: b.UserId, entries: [] });
      return send(200, { Id: id });
    }
    if ((r = url.pathname.match(/^\/Playlists\/([0-9a-f]{32})\/Items$/))) {
      const pl = playlists.get(r[1]);
      if (!pl) return send(404);
      if (req.method === 'GET') {
        const uid = url.searchParams.get('userId') ?? '';
        return send(200, { Items: pl.entries.map((e) => ({ Id: e.itemId, PlaylistItemId: e.entryId, UserData: { Played: played.has(`${uid}:${e.itemId}`) } })) });
      }
      if (req.method === 'POST') {
        if (opts.failPlaylistAdd) return send(500);
        for (const id of (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)) {
          if (!pl.entries.some((e) => e.itemId === id)) pl.entries.push({ entryId: hex('9', ++m2), itemId: id });
        }
        return send(204);
      }
      if (req.method === 'DELETE') {
        const gone = new Set((url.searchParams.get('entryIds') ?? '').split(',').filter(Boolean));
        pl.entries = pl.entries.filter((e) => !gone.has(e.entryId));
        return send(204);
      }
    }
    if ((r = url.pathname.match(/^\/Items\/([0-9a-f]{32})$/))) {
      const id = r[1];
      if (req.method === 'DELETE') return playlists.delete(id) ? send(204) : send(404);
      if (req.method === 'POST') {
        const it = catalog.get(id);
        if (it) { it.OfficialRating = b.OfficialRating; it.LockedFields = b.LockedFields; if (b.Tags !== undefined) it.Tags = b.Tags; return send(204); }
        if (playlists.has(id) || id.startsWith('d')) { names.set(id, b.Name); return send(204); }
        return send(404);
      }
    }
    if ((r = url.pathname.match(/^\/Items\/([0-9a-f]{32})\/Images\/(\w+)$/))) {
      const key = `${r[1]}:${r[2]}`;
      if (req.method === 'POST') { images.set(key, String(b)); return send(204); }
      if (req.method === 'GET') {
        const data = images.get(key);
        if (!data) return send(404);
        res.setHeader('Content-Type', 'image/png');
        return void res.end(Buffer.from(data, 'base64'));
      }
    }
    const m = url.pathname.match(/^\/Users\/([0-9a-f]{32})(\/(Policy|Password|Configuration))?$/);
    if (m) {
      const u = users.get(m[1]);
      if (!u) return send(404);
      if (!m[2] && req.method === 'GET') return send(200, { Id: u.Id, Name: u.Name, Policy: u.Policy, Configuration: u.Config ?? {} });
      if (!m[2] && req.method === 'DELETE') { users.delete(u.Id); return send(204); }
      if (m[3] === 'Policy') {
        if (opts.failPolicy) return send(500);
        u.Policy = { ...b };
        if (opts.ignoreFolders) u.Policy.EnabledFolders = [];
        return send(204);
      }
      if (m[3] === 'Password') { if (opts.failPassword) return send(500); u.Password = b.NewPw; return send(204); }
      if (m[3] === 'Configuration') { u.Config = b; return send(204); }
    }
    return send(404);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return { server, url: `http://127.0.0.1:${port}`, users, calls, catalog, played, favorites, playlists, names, images, addUser, addItem, opts, close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }) };
}

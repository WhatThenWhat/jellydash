import { createServer, type IncomingMessage, type Server } from 'node:http';

export type FakeUser = { Id: string; Name: string; Policy: Record<string, unknown>; Password?: string };

export type Fake = {
  server: Server;
  url: string;
  users: Map<string, FakeUser>;
  calls: string[];
  opts: { failPolicy: boolean; failPassword: boolean; goodKey: string; ignoreFolders: boolean; dropCreateResponse: boolean };
  close(): Promise<void>;
};

function body(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data ? JSON.parse(data) : undefined));
  });
}

export async function startFake(): Promise<Fake> {
  const users = new Map<string, FakeUser>();
  const calls: string[] = [];
  const opts = { failPolicy: false, failPassword: false, goodKey: 'good-key', ignoreFolders: false, dropCreateResponse: false };
  let n = 0;
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
    const m = url.pathname.match(/^\/Users\/([0-9a-f]{32})(\/(Policy|Password|Configuration))?$/);
    if (m) {
      const u = users.get(m[1]);
      if (!u) return send(404);
      if (!m[2] && req.method === 'GET') return send(200, { Id: u.Id, Name: u.Name, Policy: u.Policy });
      if (!m[2] && req.method === 'DELETE') { users.delete(u.Id); return send(204); }
      if (m[3] === 'Policy') {
        if (opts.failPolicy) return send(500);
        u.Policy = { ...b };
        if (opts.ignoreFolders) u.Policy.EnabledFolders = [];
        return send(204);
      }
      if (m[3] === 'Password') { if (opts.failPassword) return send(500); u.Password = b.NewPw; return send(204); }
      if (m[3] === 'Configuration') return send(204);
    }
    return send(404);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return { server, url: `http://127.0.0.1:${port}`, users, calls, opts, close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }) };
}

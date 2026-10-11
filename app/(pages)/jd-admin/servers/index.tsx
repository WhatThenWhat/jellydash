'use client';

import { DELETE, PATCH, POST } from '@/app/utils/requestHandler';
import { toast } from '@/components/breeze-ui/toast/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ServerSummary, useServer } from '@/hooks/useServer';
import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';

type TestResult = { ok: boolean; serverName: string | null; version: string | null; jfServerId: string | null; libraryCount: number };

function ServerDialog({
  open,
  onOpenChange,
  server
}: Readonly<{ open: boolean; onOpenChange: (o: boolean) => void; server?: ServerSummary }>) {
  const { refresh, select } = useServer();
  const [name, setName] = useState(server?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(server?.base_url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const editing = !!server;

  const reset = (o: boolean) => {
    if (o) {
      setName(server?.name ?? '');
      setBaseUrl(server?.base_url ?? '');
      setApiKey('');
      setResult(null);
    }
    onOpenChange(o);
  };

  const test = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await POST<object, TestResult>('/api/servers/test', {
        ...(editing ? { id: server!.id } : {}),
        baseUrl,
        apiKey
      });
      setResult(`Connected to ${r.serverName ?? 'Jellyfin'} ${r.version ?? ''} (${r.libraryCount} libraries).`);
    } catch (err: any) {
      setResult(`Failed: ${err?.message}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      if (editing) {
        await PATCH(`/api/servers/${server!.id}`, { name, baseUrl, ...(apiKey ? { apiKey } : {}) });
      } else {
        const created = await POST<object, ServerSummary>('/api/servers', { name, baseUrl, apiKey });
        await refresh();
        await select(created.id);
      }
      await refresh();
      toast({ title: editing ? 'Server saved' : 'Server added', description: name, variant: 'success', duration: 4000 });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Could not save server', description: err?.message, variant: 'destructive', duration: 6000 });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = name.trim() && baseUrl.trim() && (editing || apiKey.trim());

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Server' : 'Add Jellyfin Server'}</DialogTitle>
          <DialogDescription>
            Use the server&apos;s external https URL, the same one Wizarr uses. Create a dedicated
            API key for Jellydash in Jellyfin (Dashboard &gt; API Keys).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Label htmlFor="srv-name" className="flex flex-col gap-1">
            Name
            <Input id="srv-name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="e.g. Lake" />
          </Label>
          <Label htmlFor="srv-url" className="flex flex-col gap-1">
            URL
            <Input id="srv-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} disabled={busy} placeholder="https://jellyfin.example.com" />
          </Label>
          <Label htmlFor="srv-key" className="flex flex-col gap-1">
            API key {editing && <span className="text-xs text-muted-foreground">(leave empty to keep the current key)</span>}
            <Input id="srv-key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={busy} />
          </Label>
          {result && <p className="text-sm">{result}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={test} disabled={busy || !baseUrl.trim() || (!editing && !apiKey.trim())}>
            Test connection
          </Button>
          <Button onClick={save} disabled={busy || !canSubmit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServerRow({ server }: Readonly<{ server: ServerSummary }>) {
  const { refresh } = useServer();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const test = async () => {
    setBusy(true);
    try {
      const r = await POST<object, TestResult>('/api/servers/test', { id: server.id });
      setStatus(`OK: ${r.serverName ?? 'Jellyfin'} ${r.version ?? ''}`);
    } catch (err: any) {
      setStatus(`Failed: ${err?.message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await DELETE(`/api/servers/${server.id}`);
      await refresh();
      setDeleteOpen(false);
    } catch (err: any) {
      toast({ title: 'Could not remove server', description: err?.message, variant: 'destructive', duration: 5000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{server.name}</div>
          <div className="text-sm text-muted-foreground break-all">{server.base_url}</div>
          <div className="text-xs text-muted-foreground break-all">
            Jellyfin ServerId: {server.jf_server_id ?? 'not reported (Wizarr cannot match this server)'}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={test} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>Edit</Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>Remove</Button>
        </div>
      </div>
      {status && <div className="text-sm">{status}</div>}

      <ServerDialog open={editOpen} onOpenChange={setEditOpen} server={server} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove &quot;{server.name}&quot;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the server, its access groups and membership history from Jellydash. The
            Jellyfin server and its users are not changed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ServersPage() {
  const { servers, isLoading } = useServer();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card className="flex flex-col w-full gap-5 p-10">
      <CardHeader className="p-0 flex-row items-center justify-between">
        <div>
          <CardTitle>Servers</CardTitle>
          <CardDescription>
            Jellyfin servers managed by this Jellydash. Switch between them with the selector in the
            header.
          </CardDescription>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Server
        </Button>
      </CardHeader>

      <div className="flex flex-col gap-3">
        {isLoading && <CardDescription>Loading...</CardDescription>}
        {!isLoading && servers.length === 0 && <CardDescription>No servers yet.</CardDescription>}
        {servers.map((s) => (
          <ServerRow key={s.id} server={s} />
        ))}
      </div>

      <ServerDialog open={addOpen} onOpenChange={setAddOpen} />
    </Card>
  );
}

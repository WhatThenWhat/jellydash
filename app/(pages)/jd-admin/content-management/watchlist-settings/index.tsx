'use client';

import { toast } from '@/components/breeze-ui/toast/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import useQueryHandler from '@/hooks/useQueryHandler';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type RunInfo = { lastRunAt: string | null; lastOk: boolean | null; lastError: string | null; lastSummary: string | null };

type WatchlistResponse = {
  settings: { enabled: boolean; moviesName: string; viewName: string };
  moviesImageUrl: string | null;
  playlistsImageUrl: string | null;
  run: RunInfo;
  pollSeconds: number;
};

type SaveResponse = WatchlistResponse & {
  applyResult: { fixed: number; failed: Array<{ playlistId: string; error: string }> };
};

async function message(res: Response, fallback: string) {
  try {
    const body = await res.json();
    if (body?.message) return body.message as string;
  } catch {}
  return fallback;
}

export default function WatchlistSettings() {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [moviesName, setMoviesName] = useState('');
  const [viewName, setViewName] = useState('');
  const [moviesImage, setMoviesImage] = useState<File | null>(null);
  const [playlistsImage, setPlaylistsImage] = useState<File | null>(null);
  const [busy, setBusy] = useState<'save' | 'run' | null>(null);
  const [failures, setFailures] = useState<Array<{ playlistId: string; error: string }>>([]);

  const { data, isError, error, isPending, refetch } = useQueryHandler<WatchlistResponse>({
    queryKey: 'watchlist-settings',
    endpoint: 'watchlist-settings'
  });

  useEffect(() => {
    if (data) {
      setEnabled(data.settings.enabled);
      setMoviesName(data.settings.moviesName);
      setViewName(data.settings.viewName);
    }
  }, [data]);

  const save = async () => {
    setBusy('save');
    try {
      const form = new FormData();
      form.append('enabled', String(enabled));
      form.append('moviesPlaylistName', moviesName);
      form.append('playlistsViewName', viewName);
      if (moviesImage) form.append('moviesImage', moviesImage);
      if (playlistsImage) form.append('playlistsImage', playlistsImage);

      const res = await fetch('/api/watchlist-settings', { method: 'POST', body: form });
      if (!res.ok) throw new Error(await message(res, 'Failed to save watchlist settings'));
      const result: SaveResponse = await res.json();

      setMoviesImage(null);
      setPlaylistsImage(null);
      setFailures(result.applyResult.failed);
      await queryClient.invalidateQueries({ queryKey: ['watchlist-settings'] });

      const failed = result.applyResult.failed.length;
      toast({
        title: 'Watchlist settings saved',
        description: result.settings.enabled
          ? failed > 0
            ? `Applied to ${result.applyResult.fixed} playlist(s), ${failed} failed. See details below.`
            : `Applied to ${result.applyResult.fixed} playlist(s).`
          : 'The Watchlist is switched off for this server.',
        variant: failed > 0 ? 'destructive' : 'success',
        duration: 5000
      });
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err?.message ?? 'Could not save', variant: 'destructive', duration: 5000 });
    } finally {
      setBusy(null);
    }
  };

  const runNow = async () => {
    setBusy('run');
    try {
      const res = await fetch('/api/watchlist-settings/run', { method: 'POST' });
      if (!res.ok) throw new Error(await message(res, 'The run failed'));
      await refetch();
      toast({ title: 'Run finished', description: 'See the status line below.', variant: 'success', duration: 3000 });
    } catch (err: any) {
      toast({ title: 'Run failed', description: err?.message ?? 'The run failed', variant: 'destructive', duration: 5000 });
      await refetch();
    } finally {
      setBusy(null);
    }
  };

  if (isError) return <div>Error loading watchlist settings: {error.message}</div>;

  const run = data?.run;

  return (
    <Card className="flex flex-col w-full gap-8 p-10">
      <CardHeader className="p-0">
        <CardTitle>Watchlist Settings</CardTitle>
        <CardDescription>
          Mirrors each user&apos;s Jellyfin favorites into playlists on the selected server. Movies go to one Watchlist playlist. A
          favorited show, season or episode goes to a playlist named after the show. Watched items are removed and an empty playlist is
          deleted. A background check runs about every {data?.pollSeconds ?? 60} seconds, so changes show up after the next check. The
          first check after switching it on adds every existing favorite.
        </CardDescription>
      </CardHeader>

      {isPending ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="flex flex-col gap-8 max-w-md">
          <label className="flex items-center gap-3 border rounded-lg p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={busy !== null}
              className="h-4 w-4"
            />
            <span className="font-medium">Turn on the Watchlist for this server</span>
          </label>

          <div className="flex flex-col gap-4 border rounded-lg p-4">
            <div className="font-medium">&quot;Playlists&quot; tile</div>
            <Label htmlFor="playlistsViewName" className="flex flex-col gap-1">
              Name
              <Input id="playlistsViewName" value={viewName} maxLength={100} onChange={(e) => setViewName(e.target.value)} disabled={busy !== null} />
            </Label>
            <Label htmlFor="playlistsImage" className="flex flex-col gap-1">
              Thumbnail (PNG or JPEG, up to 2 MB)
              <Input
                id="playlistsImage"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => setPlaylistsImage(e.target.files?.[0] ?? null)}
                disabled={busy !== null}
              />
            </Label>
            {data?.playlistsImageUrl && (
              <div className="flex items-center justify-center h-40 w-full rounded-md border bg-muted/40 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.playlistsImageUrl} alt="Current Playlists tile image" className="max-h-full max-w-full object-contain" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 border rounded-lg p-4">
            <div className="font-medium">Movies Watchlist</div>
            <Label htmlFor="moviesPlaylistName" className="flex flex-col gap-1">
              Name
              <Input id="moviesPlaylistName" value={moviesName} maxLength={100} onChange={(e) => setMoviesName(e.target.value)} disabled={busy !== null} />
            </Label>
            <Label htmlFor="moviesImage" className="flex flex-col gap-1">
              Primary image (PNG or JPEG, up to 2 MB)
              <Input
                id="moviesImage"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => setMoviesImage(e.target.files?.[0] ?? null)}
                disabled={busy !== null}
              />
            </Label>
            {data?.moviesImageUrl && (
              <div className="flex items-center justify-center h-40 w-full rounded-md border bg-muted/40 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.moviesImageUrl} alt="Current watchlist playlist image" className="max-h-full max-w-full object-contain" />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button onClick={save} disabled={busy !== null || !moviesName.trim() || !viewName.trim()}>
              {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {busy === 'save' ? 'Saving...' : 'Save & Apply Now'}
            </Button>
            <Button variant="outline" onClick={runNow} disabled={busy !== null || !data?.settings.enabled}>
              {busy === 'run' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Check now
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            {run?.lastRunAt ? (
              <>
                Last check {new Date(run.lastRunAt).toLocaleString()}: {run.lastOk ? 'ok' : 'problems'}
                {run.lastSummary ? `. ${run.lastSummary}` : ''}
                {run.lastError ? `. ${run.lastError}` : ''}
              </>
            ) : (
              'No check has run for this server yet.'
            )}
          </div>

          {failures.length > 0 && (
            <div className="flex flex-col gap-2 border border-destructive/50 bg-destructive/5 rounded-lg p-4 text-sm">
              <div className="font-medium text-destructive">
                {failures.length} item{failures.length > 1 ? 's' : ''} failed to update
              </div>
              <ul className="flex flex-col gap-1">
                {failures.map((f) => (
                  <li key={f.playlistId} className="text-muted-foreground">
                    <span className="font-mono text-xs">{f.playlistId}</span> - {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

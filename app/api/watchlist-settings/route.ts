import { ValidationError } from '@/lib/core/errors';
import { MAX_IMAGE_BYTES, type ImageSlot } from '@/lib/core/watchlistStore';
import { route, selectedServer } from '@/lib/server/http';
import { pollSeconds, reapplyWatchlist, watchlistStore } from '@/lib/server/watchlistRunner';
import { NextResponse } from 'next/server';

function state(serverId: string) {
  const ws = watchlistStore();
  const stamp = (slot: ImageSlot) => {
    const s = ws.imageStamp(serverId, slot);
    return s ? `/api/watchlist-settings/image?slot=${slot}&v=${encodeURIComponent(s)}` : null;
  };
  return {
    settings: ws.getSettings(serverId),
    moviesImageUrl: stamp('movies'),
    playlistsImageUrl: stamp('view'),
    run: ws.getRun(serverId),
    pollSeconds: pollSeconds()
  };
}

export const GET = route(async (request) => {
  const { server } = selectedServer(request);
  return NextResponse.json(state(server.id));
});

async function fileBytes(value: FormDataEntryValue | null): Promise<Uint8Array | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_IMAGE_BYTES) throw new ValidationError('The image is larger than 2 MB');
  return new Uint8Array(await value.arrayBuffer());
}

/** Saves names, the on/off switch and images for the selected server, then re-applies them right away. */
export const POST = route(async (request) => {
  const { server } = selectedServer(request);
  const ws = watchlistStore();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ValidationError('Request must be a form');
  }

  // Validate every image first so a bad upload saves nothing.
  const moviesImage = await fileBytes(form.get('moviesImage'));
  const viewImage = await fileBytes(form.get('playlistsImage'));
  const patch: Parameters<typeof ws.saveSettings>[1] = {};
  const movies = form.get('moviesPlaylistName');
  const view = form.get('playlistsViewName');
  const enabled = form.get('enabled');
  if (typeof movies === 'string') patch.moviesName = movies;
  if (typeof view === 'string') patch.viewName = view;
  if (typeof enabled === 'string') patch.enabled = enabled === 'true';

  ws.saveSettings(server.id, patch);
  if (moviesImage) ws.saveImage(server.id, 'movies', moviesImage);
  if (viewImage) ws.saveImage(server.id, 'view', viewImage);

  const applyResult = ws.getSettings(server.id).enabled ? await reapplyWatchlist(server.id) : { fixed: 0, failed: [] };
  return NextResponse.json({ ...state(server.id), applyResult });
});

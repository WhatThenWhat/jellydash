/**
 * Send many item edits to a PATCH endpoint in small batches. The server writes one item at a time
 * (one read and one write on Jellyfin per item), so a big save is split to keep each request well
 * inside a reverse proxy's read timeout. Stops at the first request that cannot be completed; the
 * items not yet sent come back in `notAttempted` so they stay pending.
 */
export type ChunkResult = {
  updated: number;
  unchanged: number;
  failed: Array<{ id: string; error: string }>;
  notAttempted: string[];
  stoppedBecause?: string;
};

export async function patchInChunks<T extends { ItemId: string }>(
  endpoint: string,
  items: T[],
  size = 25,
  onProgress?: (done: number, total: number) => void
): Promise<ChunkResult> {
  const out: ChunkResult = { updated: 0, unchanged: 0, failed: [], notAttempted: [] };
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    try {
      const res = await fetch(`/api/${endpoint}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk)
      });
      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.message) message = body.message;
        } catch {}
        throw new Error(message);
      }
      const body = (await res.json()) as { updated?: number; unchanged?: number; failed?: ChunkResult['failed'] };
      out.updated += body.updated ?? 0;
      out.unchanged += body.unchanged ?? 0;
      out.failed.push(...(body.failed ?? []));
    } catch (error) {
      out.stoppedBecause = error instanceof Error ? error.message : String(error);
      out.notAttempted = items.slice(i).map((x) => x.ItemId);
      return out;
    }
    onProgress?.(Math.min(i + size, items.length), items.length);
  }
  return out;
}

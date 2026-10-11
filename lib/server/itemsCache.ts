import type { RatableItem } from '../core/content.ts';

/** Short-lived cache of a server's rateable titles, so paging does not re-read the whole library each time. */
const TTL_MS = 60_000;
const g = globalThis as unknown as { __jdItems?: Map<string, { at: number; items: RatableItem[] }> };
const cache = () => (g.__jdItems ??= new Map());

export async function cachedItems(serverId: string, load: () => Promise<RatableItem[]>): Promise<RatableItem[]> {
  const hit = cache().get(serverId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;
  const items = await load();
  cache().set(serverId, { at: Date.now(), items });
  return items;
}

export function dropItems(serverId: string): void {
  cache().delete(serverId);
}

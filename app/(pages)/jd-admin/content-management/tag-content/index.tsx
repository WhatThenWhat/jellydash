'use client';

import { toast } from '@/components/breeze-ui/toast/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { patchInChunks } from '@/hooks/patchInChunks';
import { useServer } from '@/hooks/useServer';
import { useQueryClient } from '@tanstack/react-query';
import useQueryHandler from '@/hooks/useQueryHandler';
import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import ImageWithSkeleton from '../parental-ratings/components/ImageWithSkeleton';
import { PaginationItems } from '../parental-ratings/components/Pagination';
import { SaveBar, useUnsavedWarning } from '../parental-ratings/components/SaveBar';

const PAGE_SIZE = 36;

type TagItem = { Id: string; Name: string; Type: string; Tags: string[] };
type TagPage = { Items: TagItem[]; TotalRecordCount: number; MovieCount: number; SeriesCount: number };

// Desired state per item: tag -> should the item carry it. Only entries that differ from the server are kept.
type Pending = Record<string, Record<string, boolean>>;

export default function TagContent() {
  const [page, setPage] = useState(0);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [pending, setPending] = useState<Pending>({});

  const { data: tags } = useQueryHandler<string[]>({ queryKey: 'content-tags', endpoint: 'content-tags', serverScoped: false });

  const sep = filter.indexOf(':');
  const mode = sep > 0 ? filter.slice(0, sep) : 'all';
  const filterTag = sep > 0 ? filter.slice(sep + 1) : '';
  const endpoint =
    `items/tags?page=${page}&limit=${PAGE_SIZE}` +
    (query ? `&query=${encodeURIComponent(query)}` : '') +
    (mode !== 'all' ? `&tag=${encodeURIComponent(filterTag)}&has=${mode === 'has' ? 1 : 0}` : '');

  const { data, isError, error, isPending, isFetching } = useQueryHandler<TagPage>({
    queryKey: ['item-tags', query, filter, page],
    endpoint
  });

  const queryClient = useQueryClient();
  const { selectedId } = useServer();
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState('');

  // Edits belong to one server's items; drop them if the selected server changes.
  useEffect(() => {
    setPending({});
  }, [selectedId]);

  const count = Object.keys(pending).length;
  useUnsavedWarning(count);

  const reset = () => setPending({});
  const changePage = (next: number) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const runSearch = () => {
    setQuery(text.trim());
    setPage(0);
  };
  const clearSearch = () => {
    setText('');
    setQuery('');
    setPage(0);
  };

  const has = (item: TagItem, tag: string) => pending[item.Id]?.[tag] ?? item.Tags.map((t) => t.toLowerCase()).includes(tag);

  const toggle = (item: TagItem, tag: string) => {
    const original = item.Tags.map((t) => t.toLowerCase()).includes(tag);
    const desired = !has(item, tag);
    setPending((prev) => {
      const forItem = { ...(prev[item.Id] ?? {}) };
      if (desired === original) delete forItem[tag];
      else forItem[tag] = desired;
      const next = { ...prev };
      if (Object.keys(forItem).length === 0) delete next[item.Id];
      else next[item.Id] = forItem;
      return next;
    });
  };

  const save = async () => {
    const updates = Object.entries(pending).map(([ItemId, want]) => ({
      ItemId,
      Add: Object.entries(want).filter(([, v]) => v).map(([t]) => t),
      Remove: Object.entries(want).filter(([, v]) => !v).map(([t]) => t)
    }));
    if (updates.length === 0) return;
    setIsUpdating(true);
    setProgress('');
    try {
      const result = await patchInChunks('items/update-tags', updates, 25, (done, total) =>
        setProgress(`Saving ${done} of ${total}...`)
      );
      // One refresh after everything is written, not one per batch.
      await queryClient.invalidateQueries({ queryKey: ['item-tags'] });
      const keep = new Set([...result.failed.map((f) => f.id), ...result.notAttempted]);
      setPending((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => keep.has(id))));
      if (keep.size === 0) {
        toast({ title: 'Saved', description: `${result.updated} title(s) updated.`, variant: 'success', duration: 3000 });
      } else {
        toast({
          title: `${keep.size} edit(s) not saved`,
          description: `${result.updated} updated. ${result.stoppedBecause ?? result.failed[0]?.error ?? ''} They stay pending; click Save to retry.`,
          variant: 'destructive',
          duration: 8000
        });
      }
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err?.message ?? 'Could not update tags', variant: 'destructive', duration: 5000 });
    } finally {
      setIsUpdating(false);
      setProgress('');
    }
  };

  const header = (
    <CardHeader className="p-0 gap-4">
      <div>
        <CardTitle>Tag Content</CardTitle>
        <CardDescription>
          Add or remove tags on movies and shows on the selected server. Access groups that block a tag hide every title
          carrying it. Titles without a blocked tag are visible to everyone. Tags are lowercase and are set on the Manage Tags page.
        </CardDescription>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <form
          className="flex gap-2 max-w-md flex-1 min-w-[260px]"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by title" maxLength={100} aria-label="Search by title" />
          <Button type="submit" variant="outline" size="icon" aria-label="Search">
            <Search className="h-4 w-4" />
          </Button>
          {query && (
            <Button type="button" variant="ghost" size="icon" onClick={clearSearch} aria-label="Clear search">
              <X className="h-4 w-4" />
            </Button>
          )}
        </form>
        <Select
          value={filter}
          onValueChange={(v) => {
            setFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[220px]" aria-label="Filter by tag">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All titles</SelectItem>
            {(tags ?? []).flatMap((t) => [
              <SelectItem key={`has:${t}`} value={`has:${t}`}>Tagged {t}</SelectItem>,
              <SelectItem key={`not:${t}`} value={`not:${t}`}>Not tagged {t}</SelectItem>
            ])}
          </SelectContent>
        </Select>
      </div>
    </CardHeader>
  );

  if (tags && tags.length === 0) {
    return (
      <Card className="flex flex-col w-full gap-6 p-10">
        {header}
        <CardDescription>
          No tags are set up yet. Add one (for example <code>hold</code>) on the{' '}
          <Link className="underline" href="/jd-admin/content-management/manage-tags">Manage Tags</Link> page.
        </CardDescription>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="flex flex-col w-full gap-6 p-10">
        {header}
        <p className="text-destructive">{error.message}</p>
      </Card>
    );
  }

  if (isPending) {
    return (
      <Card className="flex flex-col w-full gap-6 p-10">
        {header}
        <div className="grid gap-4 w-full mt-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[330px] w-[220px]" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col w-full gap-10 p-10">
      {header}

      {data.Items.length === 0 ? (
        <CardDescription>{query || filter !== 'all' ? 'No titles match.' : 'No movies or shows found on this server.'}</CardDescription>
      ) : (
        <>
          <CardDescription>
            {data.TotalRecordCount} title(s): {data.MovieCount} movies, {data.SeriesCount} shows.
          </CardDescription>

          <div className="grid gap-4 w-full mt-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
            {data.Items.map((item) => {
              const managed = new Set(tags ?? []);
              const others = item.Tags.filter((t) => !managed.has(t.toLowerCase()));
              return (
                <div className="flex flex-col" key={item.Id}>
                  <div className="flex justify-center p-2 rounded-lg">
                    <ImageWithSkeleton src={`/api/items/image?id=${item.Id}&w=220&h=330`} alt={item.Name} />
                  </div>
                  <p className="text-center mt-2">{item.Name}</p>
                  <div className="flex flex-wrap gap-1 justify-center mt-1">
                    {(tags ?? []).map((t) => (
                      <Button
                        key={t}
                        type="button"
                        size="sm"
                        variant={has(item, t) ? 'default' : 'outline'}
                        aria-pressed={has(item, t)}
                        onClick={() => toggle(item, t)}
                        disabled={isUpdating}
                      >
                        {t}
                      </Button>
                    ))}
                  </div>
                  {others.length > 0 && (
                    <p className="text-xs text-muted-foreground text-center mt-1">Other tags: {others.join(', ')}</p>
                  )}
                </div>
              );
            })}
          </div>

          <PaginationItems
            currentPage={page}
            totalItems={data.TotalRecordCount}
            perPage={PAGE_SIZE}
            onPageChange={changePage}
            disabled={isUpdating || isFetching}
          />

          <SaveBar count={count} saving={isUpdating} progress={progress} onSave={save} onDiscard={reset} />
        </>
      )}
    </Card>
  );
}

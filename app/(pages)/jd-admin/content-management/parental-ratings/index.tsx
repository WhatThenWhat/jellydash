'use client';

import { toast } from '@/components/breeze-ui/toast/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useMutationHandler } from '@/hooks/useMutationHandler';
import useQueryHandler from '@/hooks/useQueryHandler';
import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Rating } from '@/lib/shared/ratings';
import Items, { NO_RATING, type RatingItem } from './components/Items';
import { PaginationItems } from './components/Pagination';

const PAGE_SIZE = 18;

type RatingPage = {
  Items: RatingItem[];
  TotalRecordCount: number;
  MovieCount: number;
  SeriesCount: number;
  Page: number;
  TotalPages: number;
};

type UpdateResult = { updated: number; failed: Array<{ id: string; error: string }> };

export default function ParentalRatings() {
  const [page, setPage] = useState(0);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [ratings, setRatings] = useState<Record<string, string>>({});

  const { data: choices } = useQueryHandler<Rating[]>({ queryKey: 'ratings', endpoint: 'ratings', serverScoped: false });

  const endpoint =
    `items/official-ratings?page=${page}&limit=${PAGE_SIZE}` +
    (query ? `&query=${encodeURIComponent(query)}` : '') +
    (filter !== 'all' ? `&rating=${encodeURIComponent(filter)}` : '');

  const { data, isError, error, isPending, isFetching } = useQueryHandler<RatingPage>({
    queryKey: ['official-ratings', query, filter, page],
    endpoint
  });

  const { mutateAsync: updateRatings, isPending: isUpdating } = useMutationHandler<
    Array<{ ItemId: string; Rating: string }>,
    UpdateResult
  >({
    endpoint: 'items/update-ratings',
    method: 'PATCH',
    mutationKey: 'update-ratings',
    invalidateQueryKeys: ['official-ratings']
  });

  const changePage = (next: number) => {
    setPage(next);
    setRatings({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const runSearch = () => {
    setQuery(text.trim());
    setPage(0);
    setRatings({});
  };

  const clearSearch = () => {
    setText('');
    setQuery('');
    setPage(0);
    setRatings({});
  };

  const save = async () => {
    const updates = Object.entries(ratings).map(([ItemId, Rating]) => ({ ItemId, Rating: Rating === NO_RATING ? '' : Rating }));
    if (updates.length === 0) return;

    try {
      const result = await updateRatings(updates);
      if (result.failed.length === 0) {
        toast({ title: 'Saved', description: `${result.updated} rating(s) updated.`, variant: 'success', duration: 3000 });
        setRatings({});
      } else {
        // Keep the failed ones selected so a second Save retries only those.
        const failedIds = new Set(result.failed.map((f) => f.id));
        setRatings((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => failedIds.has(id))));
        toast({
          title: `${result.failed.length} item(s) failed`,
          description: `${result.updated} updated. ${result.failed[0].error}`,
          variant: 'destructive',
          duration: 6000
        });
      }
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err?.message ?? 'Could not update ratings', variant: 'destructive', duration: 5000 });
    }
  };

  const header = (
    <CardHeader className="p-0 gap-4">
      <div>
        <CardTitle>Rate Content</CardTitle>
        <CardDescription>
          Set or remove the parental rating for movies and shows on the selected server. Titles without a configured rating are listed first. Choose "No rating" to remove a rating.
        </CardDescription>
      </div>
      <form
        className="flex gap-2 max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by title"
          maxLength={100}
          aria-label="Search by title"
        />
        <Button type="submit" variant="outline" size="icon" aria-label="Search">
          <Search className="h-4 w-4" />
        </Button>
        {query && (
          <Button type="button" variant="ghost" size="icon" onClick={clearSearch} aria-label="Clear search">
            <X className="h-4 w-4" />
          </Button>
        )}
        <Select
          value={filter}
          onValueChange={(v) => {
            setFilter(v);
            setPage(0);
            setRatings({});
          }}
        >
          <SelectTrigger className="w-[220px]" aria-label="Filter by rating">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All titles</SelectItem>
            <SelectItem value="__needs__">Needs a rating</SelectItem>
            {(choices ?? []).map((r) => (
              <SelectItem key={r.id} value={r.value}>
                Rated {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </form>
    </CardHeader>
  );

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

  const pending = Object.keys(ratings).length;

  return (
    <Card className="flex flex-col w-full gap-10 p-10">
      {header}

      {data.Items.length === 0 ? (
        <CardDescription>{query || filter !== 'all' ? 'No titles match the search and filter.' : 'No movies or shows found on this server.'}</CardDescription>
      ) : (
        <>
          <CardDescription>
            {data.TotalRecordCount} title(s): {data.MovieCount} movies, {data.SeriesCount} shows.
          </CardDescription>
          <Items items={data.Items} ratings={ratings} onRatingChange={(id, v) => setRatings((prev) => ({ ...prev, [id]: v }))} />

          <PaginationItems
            currentPage={page}
            totalItems={data.TotalRecordCount}
            perPage={PAGE_SIZE}
            onPageChange={changePage}
            disabled={isUpdating || isFetching}
          />

          <Button className="self-end px-10" onClick={save} disabled={isUpdating || pending === 0}>
            {isUpdating ? 'Saving...' : pending > 0 ? `Save (${pending})` : 'Save'}
          </Button>
        </>
      )}
    </Card>
  );
}

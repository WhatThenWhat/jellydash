'use client';

import { toast } from '@/components/breeze-ui/toast/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useMutationHandler } from '@/hooks/useMutationHandler';
import useQueryHandler from '@/hooks/useQueryHandler';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

export default function ManageTags() {
  const [tag, setTag] = useState('');

  const { data, isError, error, isPending } = useQueryHandler<string[]>({
    queryKey: 'content-tags',
    endpoint: 'content-tags',
    serverScoped: false
  });

  const { mutateAsync: createTag, isPending: isCreating } = useMutationHandler({
    endpoint: 'content-tags',
    method: 'POST',
    mutationKey: 'content-tags-create',
    invalidateQueryKeys: ['content-tags']
  });

  const { mutateAsync: removeTag, isPending: isRemoving } = useMutationHandler({
    endpoint: 'content-tags',
    method: 'DELETE',
    mutationKey: 'content-tags-delete',
    invalidateQueryKeys: ['content-tags']
  });

  const add = async () => {
    try {
      await createTag({ tag });
      toast({ title: 'Tag added', description: `${tag.trim().toLowerCase()} is now offered on Tag Content.`, variant: 'success', duration: 3000 });
      setTag('');
    } catch (err: any) {
      toast({ title: 'Could not add tag', description: err?.message, variant: 'destructive', duration: 5000 });
    }
  };

  const remove = async (t: string) => {
    try {
      await removeTag({ tag: t });
      toast({ title: 'Tag removed from the list', description: 'Titles already carrying it in Jellyfin keep it.', variant: 'success', duration: 4000 });
    } catch (err: any) {
      toast({ title: 'Could not remove tag', description: err?.message, variant: 'destructive', duration: 5000 });
    }
  };

  if (isError) return <div>Error loading tags: {error.message}</div>;

  return (
    <Card className="flex flex-col w-full gap-5 p-10">
      <CardHeader className="p-0">
        <CardTitle>Manage Tags</CardTitle>
        <CardDescription>
          The tags offered on the Tag Content page. They are saved in lowercase and written to Jellyfin exactly as shown. To hide
          titles from an access group, put the same tag in that group&apos;s Blocked tags.
        </CardDescription>
      </CardHeader>

      <form
        className="flex gap-2 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          if (tag.trim()) void add();
        }}
      >
        <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. hold" maxLength={50} aria-label="New tag" disabled={isCreating} />
        <Button type="submit" disabled={isCreating || !tag.trim()}>
          {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Add
        </Button>
      </form>

      {isPending ? (
        <CardDescription>Loading...</CardDescription>
      ) : (data ?? []).length === 0 ? (
        <CardDescription>No tags yet.</CardDescription>
      ) : (
        <ul className="flex flex-col gap-2 max-w-md">
          {(data ?? []).map((t) => (
            <li key={t} className="flex items-center justify-between border rounded-md px-3 py-2">
              <span>{t}</span>
              <Button variant="ghost" size="icon" onClick={() => void remove(t)} disabled={isRemoving} aria-label={`Remove ${t}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

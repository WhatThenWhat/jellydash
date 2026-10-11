'use client';

import { toast } from '@/components/breeze-ui/toast/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useMutationHandler } from '@/hooks/useMutationHandler';
import useQueryHandler from '@/hooks/useQueryHandler';
import { extractRatingNumber, Rating } from '@/lib/shared/ratings';
import type { GroupDto, LibraryWithGroups } from '@/lib/shared/types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

const NO_CAP = '__no-cap__';

const splitTags = (text: string) =>
  text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new group. */
  group?: GroupDto;
};

export default function GroupDialog({ open, onOpenChange, group }: Readonly<Props>) {
  const editing = !!group;
  const [name, setName] = useState('');
  const [ratingId, setRatingId] = useState(NO_CAP);
  const [blocked, setBlocked] = useState('');
  const [allowed, setAllowed] = useState('');
  const [downloads, setDownloads] = useState(false);
  const [liveTv, setLiveTv] = useState(false);
  const [sessions, setSessions] = useState('2');
  const [libraryIds, setLibraryIds] = useState<string[]>([]);

  const { data: ratings } = useQueryHandler<Rating[]>({
    queryKey: 'ratings',
    endpoint: 'ratings',
    serverScoped: false
  });
  const { data: libraries } = useQueryHandler<LibraryWithGroups[]>({
    queryKey: 'libraries-groups',
    endpoint: 'libraries/groups'
  });

  const save = useMutationHandler<Record<string, unknown>, GroupDto>({
    endpoint: 'groups',
    method: editing ? 'PATCH' : 'POST',
    mutationKey: editing ? 'groups-update' : 'groups-create',
    invalidateQueryKeys: ['groups', 'libraries-groups']
  });

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? '');
    setBlocked(group ? group.blocked_tags.join(', ') : '');
    setAllowed(group ? group.allowed_tags.join(', ') : '');
    setDownloads(group?.allow_downloads ?? false);
    setLiveTv(group?.allow_live_tv ?? false);
    setSessions(String(group?.max_sessions ?? 2));
    setLibraryIds(group?.library_ids ?? []);
    const match = (ratings ?? []).find((r) => extractRatingNumber(r.value) === group?.max_rating);
    setRatingId(group?.max_rating == null ? NO_CAP : (match?.id ?? NO_CAP));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group?.id]);

  const handleSave = async () => {
    const rating = (ratings ?? []).find((r) => r.id === ratingId);
    if (rating && extractRatingNumber(rating.value) == null) {
      toast({
        title: 'Rating has no number',
        description: `"${rating.label}" has no number in its Value, so it cannot set a cap. Add a number to the Value in Manage Ratings or choose another rating.`,
        variant: 'destructive',
        duration: 7000
      });
      return;
    }
    try {
      const saved = await save.mutateAsync({
        ...(editing ? { id: group!.id } : {}),
        name,
        max_rating: rating ? extractRatingNumber(rating.value) : null,
        blocked_tags: splitTags(blocked),
        allowed_tags: splitTags(allowed),
        allow_downloads: downloads,
        allow_live_tv: liveTv,
        max_sessions: Number(sessions),
        library_ids: libraryIds
      });
      const apply = saved?.apply;
      if (editing && apply && apply.failed.length > 0) {
        toast({
          title: 'Group saved, but some members were not updated',
          description: `${apply.applied} of ${apply.total} updated. ${apply.failed[0].username}: ${apply.failed[0].error}. Save again to retry.`,
          variant: 'destructive',
          duration: 9000
        });
      } else {
        toast({
          title: editing ? 'Access group saved' : 'Access group created',
          description: editing
            ? `Applied to ${apply?.applied ?? 0} existing member(s) and all new members.${apply?.skipped.length ? ` ${apply.skipped.length} administrator account(s) skipped.` : ''}`
            : name,
          variant: 'success',
          duration: 5000
        });
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Could not save access group', description: err?.message, variant: 'destructive', duration: 5000 });
    }
  };

  const toggleLibrary = (id: string, checked: boolean) =>
    setLibraryIds((cur) => (checked ? [...new Set([...cur, id])] : cur.filter((l) => l !== id)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Access Group' : 'New Access Group'}</DialogTitle>
          <DialogDescription>
            Applied to new members and, each time you save, to every existing member. Settings
            changed by hand on a member in Jellyfin are overwritten. Leave the rating cap and
            both tag fields empty for no restrictions beyond the libraries you tick.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Label htmlFor="group-name" className="flex flex-col gap-1">
            Name
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} disabled={save.isPending} placeholder="e.g. Family" />
          </Label>

          <div>
            Max Parental Rating (optional)
            <Select value={ratingId} onValueChange={setRatingId} disabled={save.isPending}>
              <SelectTrigger>
                <SelectValue placeholder="No cap" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Rating</SelectLabel>
                  <SelectItem value={NO_CAP} className="cursor-pointer">No cap</SelectItem>
                  {(ratings ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id} className="cursor-pointer" disabled={extractRatingNumber(r.value) == null}>
                      {r.label} {extractRatingNumber(r.value) == null ? '(no number: cannot cap)' : `(cap ${extractRatingNumber(r.value)})`}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <Label htmlFor="group-blocked" className="flex flex-col gap-1">
            Blocked tags (comma separated)
            <Input id="group-blocked" value={blocked} onChange={(e) => setBlocked(e.target.value)} disabled={save.isPending} placeholder="e.g. hold (leave empty for none)" />
          </Label>

          <Label htmlFor="group-allowed" className="flex flex-col gap-1">
            Allowed tags (optional, comma separated)
            <Input id="group-allowed" value={allowed} onChange={(e) => setAllowed(e.target.value)} disabled={save.isPending} placeholder="leave empty for no restriction" />
            <span className="text-xs text-muted-foreground">
              When set, the user only sees items that carry at least one of these tags.
            </span>
          </Label>

          <Label htmlFor="group-sessions" className="flex flex-col gap-1">
            Max active sessions
            <Input id="group-sessions" type="number" min={0} max={100} value={sessions} onChange={(e) => setSessions(e.target.value)} disabled={save.isPending} />
          </Label>

          <div className="flex items-center gap-2">
            <Checkbox id="group-downloads" checked={downloads} onCheckedChange={(v) => setDownloads(v === true)} disabled={save.isPending} />
            <Label htmlFor="group-downloads">Allow downloads</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="group-livetv" checked={liveTv} onCheckedChange={(v) => setLiveTv(v === true)} disabled={save.isPending} />
            <Label htmlFor="group-livetv">Allow Live TV</Label>
          </div>

          <div className="flex flex-col gap-2">
            <span>Libraries</span>
            {(libraries ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">No libraries yet. Run Libraries &gt; Sync first.</span>
            )}
            {(libraries ?? []).map((lib) => (
              <div key={lib.id} className="flex items-center gap-2">
                <Checkbox id={`lib-${lib.id}`} checked={libraryIds.includes(lib.id)} onCheckedChange={(v) => toggleLibrary(lib.id, v === true)} disabled={save.isPending} />
                <Label htmlFor={`lib-${lib.id}`} className="cursor-pointer">{lib.name}</Label>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={save.isPending || !name.trim()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

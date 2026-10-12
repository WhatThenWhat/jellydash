'use client';

import { DataTableColumnHeader } from '@/components/breeze-ui/data-table';
import { toast } from '@/components/breeze-ui/toast/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useMutationHandler } from '@/hooks/useMutationHandler';
import useQueryHandler from '@/hooks/useQueryHandler';
import { extractRatingNumber, Rating } from '@/lib/shared/ratings';
import type { GroupDto } from '@/lib/shared/types';
import { ColumnDef } from '@tanstack/react-table';
import { Loader2, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import GroupDialog from '../components/GroupDialog';

function MaxRatingCell({ group }: Readonly<{ group: GroupDto }>) {
  const { data: ratings } = useQueryHandler<Rating[]>({ queryKey: 'ratings', endpoint: 'ratings', serverScoped: false });
  if (group.max_rating == null) return '—';
  const match = (ratings ?? []).find((r) => extractRatingNumber(r.value) === group.max_rating);
  return match ? match.label : group.max_rating;
}

function ActionsCell(group: Readonly<GroupDto>) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { mutateAsync: deleteGroup, isPending: isDeleting } = useMutationHandler({
    endpoint: 'groups',
    method: 'DELETE',
    mutationKey: 'groups-delete',
    invalidateQueryKeys: ['groups', 'libraries-groups']
  });

  const handleDelete = async () => {
    try {
      await deleteGroup({ id: group.id });
      setDeleteOpen(false);
    } catch (err: any) {
      toast({ title: 'Failed to delete access group', description: err?.message, variant: 'destructive', duration: 4000 });
    }
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="flex gap-2 flex-col">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setEditOpen(true); }} className="cursor-pointer">
            Edit Access Group
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDeleteOpen(true); }} className="cursor-pointer text-destructive">
            Delete Access Group
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <GroupDialog open={editOpen} onOpenChange={setEditOpen} group={group} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{group.name}&quot;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the group from Jellydash and from the Wizarr picker. Users already in the
            group keep their current Jellyfin settings. Invites that still point at this group will
            use the settings saved on the invite.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TagsCell({ tags }: Readonly<{ tags: string[] }>) {
  if (tags.length === 0) return '—';
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <Badge key={t} variant="secondary">{t}</Badge>
      ))}
    </div>
  );
}

export const columns: ColumnDef<GroupDto>[] = [
  {
    accessorKey: 'name',
    meta: { justAFlag: true },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Access Group" />,
    cell: ({ row }) => row.getValue('name')
  },
  {
    id: 'maxRating',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Max Parental Rating" />,
    cell: ({ row }) => <MaxRatingCell group={row.original} />
  },
  {
    id: 'blockedTags',
    header: 'Blocked Tags',
    cell: ({ row }) => <TagsCell tags={row.original.blocked_tags} />
  },
  {
    id: 'allowedTags',
    header: 'Allowed Tags',
    cell: ({ row }) => <TagsCell tags={row.original.allowed_tags} />
  },
  {
    id: 'libraries',
    header: 'Libraries',
    cell: ({ row }) => row.original.library_ids.length
  },
  {
    id: 'members',
    header: 'Members',
    cell: ({ row }) => row.original.member_count
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <ActionsCell {...row.original} />
  }
];

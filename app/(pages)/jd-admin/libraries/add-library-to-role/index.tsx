'use client';

import type { GroupDto, LibraryWithGroups } from '@/lib/shared/types';
import { toast } from '@/components/breeze-ui/toast/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useMutationHandler } from '@/hooks/useMutationHandler';
import useQueryHandler from '@/hooks/useQueryHandler';
import { CheckSquare, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import LibraryRow from './components/library-row';

export default function AddLibraryToRole() {
  const { data: roles, isPending: rolesPending } = useQueryHandler<GroupDto[]>({
    queryKey: 'groups',
    endpoint: 'groups'
  });

  const {
    data: libraries,
    isPending: librariesPending,
    refetch: refetchLibraries
  } = useQueryHandler<LibraryWithGroups[]>({
    queryKey: 'libraries-groups',
    endpoint: 'libraries/groups'
  });

  const { mutateAsync: addToList } = useMutationHandler({
    endpoint: 'libraries/membership',
    method: 'POST',
    mutationKey: 'role-access-add'
  });

  const { mutateAsync: removeFromList } = useMutationHandler({
    endpoint: 'libraries/membership',
    method: 'DELETE',
    mutationKey: 'role-access-remove'
  });

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [pendingLibraryId, setPendingLibraryId] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);

  const isPending = rolesPending || librariesPending;

  // Default to the first role once roles load - if that role later gets deleted, fall back the
  // same way rather than pointing at a role that no longer exists.
  useEffect(() => {
    if (!roles || roles.length === 0) return;
    if (selectedRoleId && roles.some((role) => role.id === selectedRoleId)) return;
    setSelectedRoleId(roles[0].id);
  }, [roles, selectedRoleId]);

  const selectedRole = roles?.find((role) => role.id === selectedRoleId) ?? null;

  const handleToggle = async (library: LibraryWithGroups, hasAccess: boolean) => {
    if (!selectedRole) return;

    setPendingLibraryId(library.id);

    try {
      if (hasAccess) {
        await removeFromList({ id: library.id, list: selectedRole.id });
      } else {
        await addToList({ id: library.id, list: selectedRole.id });
      }
      await refetchLibraries();
    } catch (err: any) {
      toast({
        title: 'Failed to update access',
        description: err?.message ?? `Could not update ${library.name} for ${selectedRole.name}`,
        variant: 'destructive',
        duration: 4000
      });
    } finally {
      setPendingLibraryId(null);
    }
  };

  const handleBulk = async (grant: boolean) => {
    if (!selectedRole || !libraries) return;

    const targets = libraries.filter((lib) => lib.groups.includes(selectedRole.id) !== grant);
    if (targets.length === 0) return;

    setBulkPending(true);

    try {
      const ids = targets.map((lib) => lib.id);
      if (grant) await addToList({ ids, list: selectedRole.id });
      else await removeFromList({ ids, list: selectedRole.id });
      await refetchLibraries();

      toast({
        title: grant ? 'Access granted' : 'Access revoked',
        description: `${selectedRole.name} ${grant ? 'now has' : 'no longer has'} access to ${targets.length} librar${targets.length === 1 ? 'y' : 'ies'}.`,
        variant: 'success',
        duration: 4000
      });
    } catch (err: any) {
      toast({
        title: 'Failed to update access',
        description: err?.message ?? `Could not update all libraries for ${selectedRole.name}`,
        variant: 'destructive',
        duration: 4000
      });
    } finally {
      setBulkPending(false);
    }
  };

  return (
    <Card className="flex flex-col gap-6 p-10">
      <CardHeader className="p-0">
        <CardTitle>Manage Access Group Libraries</CardTitle>
        <CardDescription>
          Pick an access group, then check off which libraries its users can see on the selected server.
        </CardDescription>
      </CardHeader>

      {rolesPending ? (
        <Skeleton className="h-9 w-full max-w-xs" />
      ) : (
        <div className="flex flex-col gap-1 max-w-xs">
          <Select value={selectedRoleId ?? undefined} onValueChange={setSelectedRoleId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an access group" />
            </SelectTrigger>
            <SelectContent>
              {(roles ?? []).map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedRole && (
            <CardDescription className="text-xs">
              {selectedRole.max_rating != null
                ? `Max parental rating: ${selectedRole.max_rating}`
                : 'No parental rating cap'}
            </CardDescription>
          )}
        </div>
      )}

      {!isPending && selectedRole && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulk(true)}
            disabled={bulkPending || pendingLibraryId !== null}
          >
            <CheckSquare className="h-4 w-4 mr-2" />
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulk(false)}
            disabled={bulkPending || pendingLibraryId !== null}
          >
            <Square className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {isPending &&
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}

        {!isPending && !selectedRole && (
          <CardDescription>No access groups yet. Create one on the Access Groups page first.</CardDescription>
        )}

        {!isPending &&
          selectedRole &&
          (libraries ?? []).map((library) => (
            <LibraryRow
              key={library.id}
              library={library}
              hasAccess={library.groups.includes(selectedRole.id)}
              isPending={pendingLibraryId === library.id || bulkPending}
              onToggle={() => handleToggle(library, library.groups.includes(selectedRole.id))}
            />
          ))}
      </div>
    </Card>
  );
}

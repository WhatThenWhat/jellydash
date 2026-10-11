'use client';

import type { LibraryWithGroups } from '@/lib/shared/types';
import { POST } from '@/app/utils/requestHandler';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/breeze-ui/toast/hooks/use-toast';
import { DataTable } from '@/components/breeze-ui/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import useQueryHandler from '@/hooks/useQueryHandler';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { columns } from './data-table/columns';

export default function SyncLibraries() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const { data, isError, error, isPending, isFetching } = useQueryHandler<LibraryWithGroups[]>({
    queryKey: 'libraries-groups',
    endpoint: 'libraries/groups'
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await POST<object, { added: number; removed: number; total: number }>('/api/libraries/sync', {});
      await queryClient.invalidateQueries({ queryKey: ['libraries-groups'] });
      await queryClient.invalidateQueries({ queryKey: ['groups'] });

      toast({
        title: 'Libraries synced',
        description: `${result.total} libraries on the server (${result.added} new, ${result.removed} removed).`,
        variant: 'success',
        duration: 4000
      });
    } catch (err: any) {
      toast({
        title: 'Sync failed',
        description: err?.message ?? 'Failed to sync libraries',
        variant: 'destructive',
        duration: 4000
      });
    } finally {
      setSyncing(false);
    }
  };

  if (isError) {
    console.error(error);
    return <div>Error loading libraries: {error.message}</div>;
  }

  return (
    <Card className="flex flex-col w-full gap-5 p-10">
      <CardHeader className="p-0 flex-row items-center justify-between">
        <div>
          <CardTitle>Libraries</CardTitle>
          <CardDescription>
            Every library Jellyfin currently reports. Click a badge to grant or revoke that
            access group&apos;s access.
          </CardDescription>
        </div>

        <Button onClick={handleSync} disabled={syncing || isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync'}
        </Button>
      </CardHeader>

      <DataTable
        columns={columns}
        data={data || []}
        loading={isPending}
        pagination
        filterInput
        loadingSkeletonHeight={400}
      />
    </Card>
  );
}

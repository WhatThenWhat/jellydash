'use client';

import { DataTable } from '@/components/breeze-ui/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import useQueryHandler from '@/hooks/useQueryHandler';
import type { GroupDto } from '@/lib/shared/types';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import GroupDialog from './components/GroupDialog';
import { columns } from './data-table/columns';

export default function ManageAccessGroups() {
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isError, error, isPending } = useQueryHandler<GroupDto[]>({
    queryKey: 'groups',
    endpoint: 'groups'
  });

  if (isError) {
    console.error(error);
    return <div>Error loading access groups: {error.message}</div>;
  }

  return (
    <Card className="flex flex-col w-full gap-5 p-10">
      <CardHeader className="p-0 flex-row items-center justify-between">
        <div>
          <CardTitle>Access Groups</CardTitle>
          <CardDescription>
            Access groups belong to the selected server. A group sets libraries, a parental rating
            cap, tags, downloads, Live TV and session limits for new users, including users invited
            through Wizarr.
          </CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Access Group
        </Button>
      </CardHeader>

      <DataTable columns={columns} data={data || []} loading={isPending} pagination filterInput loadingSkeletonHeight={400} />

      <GroupDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Card>
  );
}

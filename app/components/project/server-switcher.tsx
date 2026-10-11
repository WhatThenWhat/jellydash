'use client';

import { toast } from '@/components/breeze-ui/toast/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useServer } from '@/hooks/useServer';
import Link from 'next/link';

export function ServerSwitcher() {
  const { servers, selectedId, isLoading, select } = useServer();

  if (isLoading) return <span className="text-sm text-muted-foreground">Loading servers...</span>;

  if (servers.length === 0) {
    return (
      <Link href="/jd-admin/servers" className="text-sm underline">
        Add your first Jellyfin server
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground hidden sm:inline">Server</span>
      <Select
        value={selectedId ?? undefined}
        onValueChange={async (id) => {
          try {
            await select(id);
          } catch (err: any) {
            toast({ title: 'Could not switch server', description: err?.message, variant: 'destructive', duration: 4000 });
          }
        }}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Choose a server" />
        </SelectTrigger>
        <SelectContent>
          {servers.map((s) => (
            <SelectItem key={s.id} value={s.id} className="cursor-pointer">
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

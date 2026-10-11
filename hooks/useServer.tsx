'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { createContext, ReactNode, useCallback, useContext, useMemo } from 'react';

export type ServerSummary = {
  id: string;
  name: string;
  base_url: string;
  jf_server_id: string | null;
};

type ServersResponse = { servers: ServerSummary[]; selectedId: string | null };

type ServerContextValue = {
  servers: ServerSummary[];
  selectedId: string | null;
  selected: ServerSummary | null;
  isLoading: boolean;
  select: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const ServerContext = createContext<ServerContextValue | null>(null);

export function ServerProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { status } = useSession();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ServersResponse>({
    queryKey: ['servers-list'],
    queryFn: async () => {
      const res = await fetch('/api/servers');
      if (!res.ok) throw new Error('Failed to load servers');
      return res.json();
    },
    enabled: status === 'authenticated'
  });

  const select = useCallback(
    async (id: string) => {
      const res = await fetch('/api/servers/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error('Failed to switch server');
      // Drop everything cached for the previous server before showing the new one.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'servers-list' });
      await queryClient.invalidateQueries({ queryKey: ['servers-list'] });
    },
    [queryClient]
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['servers-list'] });
  }, [queryClient]);

  const value = useMemo<ServerContextValue>(() => {
    const servers = data?.servers ?? [];
    const selectedId = data?.selectedId ?? null;
    return {
      servers,
      selectedId,
      selected: servers.find((s) => s.id === selectedId) ?? null,
      isLoading,
      select,
      refresh
    };
  }, [data, isLoading, select, refresh]);

  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}

export function useServer(): ServerContextValue {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error('useServer must be used inside ServerProvider');
  return ctx;
}

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useServer } from './useServer';

type UseQueryHandlerProps = {
  queryKey: string | unknown[];
  endpoint: string;
  /** Server-scoped queries (the default) wait for a selected server and are keyed by it. */
  serverScoped?: boolean;
  enabled?: boolean;
};

export default function useQueryHandler<T>(props: UseQueryHandlerProps): UseQueryResult<T, Error> {
  const { queryKey, endpoint, serverScoped = true, enabled = true } = props;
  const { status } = useSession();
  const { selectedId } = useServer();

  const baseKey = Array.isArray(queryKey) ? queryKey : [queryKey];
  const key = serverScoped ? [...baseKey, selectedId] : baseKey;

  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/${endpoint}`);
      if (!res.ok) {
        let message = `Failed to fetch ${endpoint}`;
        try {
          const body = await res.json();
          if (body?.message) message = body.message;
        } catch {}
        throw new Error(message);
      }
      return res.json();
    },
    enabled: enabled && status === 'authenticated' && (!serverScoped || !!selectedId)
  });
}

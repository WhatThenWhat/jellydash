'use client';

import { ServerProvider } from '@/hooks/useServer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { StrictMode, useState } from 'react';

// Query results are kept in memory only. Nothing about users or servers is persisted in the browser.
export default function Hydrate({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } })
  );

  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ServerProvider>{children}</ServerProvider>
        </SessionProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

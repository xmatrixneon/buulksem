'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import superjson from 'superjson';
import type { AppRouter } from './types';
import { authClient } from '../auth-client';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

let browserQueryClient: QueryClient;

function getQueryClient() {
  if (typeof window === 'undefined') {
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 5, // 5 minutes
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  if (!browserQueryClient) {
    browserQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 5,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return browserQueryClient;
}

function getServerUrl() {
  // Use relative URL - proxied through Next.js at /trpc
  // This ensures cookies work since both frontend and tRPC are on same origin
  return '/trpc';
}

export function TRPCReactProvider(
  props: Readonly<{ children: React.ReactNode }>
) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: getServerUrl(),
          transformer: superjson,
          // Send cookies for authentication - Better Auth uses session cookies
          fetch(url, options) {
            return fetch(url, {
              ...options,
              credentials: 'include',
              // Ensure cookies are sent with same-site policy
              headers: {
                ...options?.headers,
              },
            });
          },
        }),
      ],
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

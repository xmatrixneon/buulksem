'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import superjson from 'superjson';
// @ts-ignore - Cross-project type import
import type { AppRouter } from './types';
import { authClient } from '../auth-client';
import { logTRPCError } from '../error-logger';

// @ts-ignore
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

let browserQueryClient: QueryClient;

function getQueryClient() {
  if (typeof window === 'undefined') {
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 5, // 5 minutes
          refetchOnWindowFocus: false,
          retry: 1,
        },
        mutations: {
          retry: 1,
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
          retry: 1,
        },
        mutations: {
          retry: 1,
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
            })
            .then(async (response) => {
              // Log tRPC errors for debugging
              if (!response.ok) {
                const clone = response.clone();
                try {
                  const errorData = await clone.json();
                  logTRPCError(
                    errorData.error || { message: response.statusText, code: response.status.toString() },
                    url.toString()
                  );
                } catch {
                  logTRPCError(
                    { message: response.statusText, code: response.status.toString() },
                    url.toString()
                  );
                }
              }
              return response;
            })
            .catch((error) => {
              logTRPCError(
                { message: error.message || 'Network error', code: 'NETWORK_ERROR' },
                url.toString()
              );
              throw error;
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

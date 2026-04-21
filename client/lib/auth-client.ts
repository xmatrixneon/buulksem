import { createAuthClient } from 'better-auth/react';

// Use relative URL for auth - proxied through Next.js at /api/auth
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined'
    ? window.location.origin // Use current origin (http://localhost:3000)
    : (process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:3000'),
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
} = authClient;

/**
 * tRPC Type Imports
 *
 * Imports AppRouter type from the server source.
 * Using a dynamic import to avoid build-time cross-project issues.
 */

// @ts-ignore - Cross-project type import
import type { AppRouter as _AppRouter } from '../../../server/src/trpc/router';

// Re-export with proper typing
export type AppRouter = _AppRouter;

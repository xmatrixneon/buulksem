/**
 * tRPC Type Imports
 *
 * Imports AppRouter type from the server package.
 * In production, the server runs on a separate domain, so this import
 * is only used for type checking during development.
 */

// Import from server package (not relative path)
import type { AppRouter } from 'cattysms/types';

export type { AppRouter };

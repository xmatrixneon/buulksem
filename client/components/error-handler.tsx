'use client';

import { useEffect } from 'react';
import { logError } from '@/lib/error-logger';

export function GlobalErrorHandler() {
  useEffect(() => {
    // Handle unhandled errors
    const handleError = (event: ErrorEvent) => {
      event.preventDefault();
      logError(event.error, {
        componentName: 'GlobalErrorHandler',
        extra: {
          type: 'unhandledError',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        }
      });
    };

    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      logError(event.reason, {
        componentName: 'GlobalErrorHandler',
        extra: {
          type: 'unhandledRejection',
          promise: event.promise,
        }
      });
    };

    // Add event listeners
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Cleanup
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}

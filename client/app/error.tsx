'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { logError } from '@/lib/error-logger';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log the error when the boundary catches it
  useEffect(() => {
    logError(error, {
      componentName: 'GlobalErrorBoundary',
      extra: { digest: error.digest }
    });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <CardTitle>Application Error</CardTitle>
          </div>
          <CardDescription>
            Something went wrong while loading this page
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Error Details */}
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <p className="text-sm font-mono text-destructive">
              {error.message || 'An unexpected error occurred'}
            </p>
            {process.env.NODE_ENV === 'development' && error.stack && (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer">
                  Stack trace (click to expand)
                </summary>
                <pre className="mt-2 text-xs overflow-auto max-h-48 text-muted-foreground">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>

          {/* Error Reference */}
          {error.digest && (
            <div className="text-sm text-muted-foreground">
              Error Reference: <code className="bg-muted px-1 rounded">{error.digest}</code>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={reset} variant="default">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            <Button onClick={() => window.location.href = '/'} variant="outline">
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Button>
          </div>

          {/* Debug Info for Developers */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-muted rounded-lg p-4 text-xs space-y-1">
              <p className="font-semibold">Debug Information:</p>
              <p>URL: {typeof window !== 'undefined' ? window.location.href : 'Unknown'}</p>
              <p>User Agent: {typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'}</p>
              <p>Timestamp: {new Date().toISOString()}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

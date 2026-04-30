/**
 * Error Logger Utility
 *
 * Centralized error logging for client-side errors
 */

interface ErrorLog {
  message: string;
  stack?: string;
  componentName?: string;
  timestamp: string;
  userAgent: string;
  url: string;
  userId?: string;
}

export function logError(error: Error | unknown, context?: { componentName?: string; extra?: Record<string, any> }) {
  const errorLog: ErrorLog = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    componentName: context?.componentName,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
    url: typeof window !== 'undefined' ? window.location.href : 'Unknown',
  };

  // Log to console with detailed info
  console.group('🔴 Error Logged');
  console.error('Component:', context?.componentName || 'Unknown');
  console.error('Message:', errorLog.message);
  if (errorLog.stack) {
    console.error('Stack:', errorLog.stack);
  }
  if (context?.extra) {
    console.error('Extra:', context.extra);
  }
  console.error('Timestamp:', errorLog.timestamp);
  console.error('URL:', errorLog.url);
  console.groupEnd();

  // Send to server for logging (optional - can be enabled later)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    // Uncomment to send errors to server
    // fetch('/api/log-error', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(errorLog),
    // }).catch(console.error);
  }

  return errorLog;
}

export function logTRPCError(error: { message?: string; code?: string; data?: any }, operation: string) {
  console.group('🔴 tRPC Error');
  console.error('Operation:', operation);
  console.error('Message:', error.message);
  console.error('Code:', error.code);
  console.error('Data:', error.data);
  console.groupEnd();
}

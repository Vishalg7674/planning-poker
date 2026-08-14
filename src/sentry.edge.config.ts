/**
 * Sentry SDK initialization for the Edge runtime (middleware/proxies).
 *
 * Loaded from src/instrumentation.ts only when NEXT_RUNTIME === 'edge'.
 * The app has no middleware today, but this keeps the documented layout
 * complete so adding edge code later just works.
 */
import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  });
}

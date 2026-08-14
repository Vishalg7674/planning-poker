/**
 * Sentry server-side SDK initialization (Next.js Node runtime).
 *
 * Loaded from src/instrumentation.ts inside register() — never imported
 * directly by app code. When SENTRY_DSN is unset (local dev, tests, CI
 * without credentials) the SDK is never initialized, so this is a no-op.
 */
import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    // Sample 10% of traces in production to stay within free quotas; the
    // realtime server (server/index.mjs) uses the same rate.
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  });
}

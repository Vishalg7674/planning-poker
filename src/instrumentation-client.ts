/**
 * Sentry client-side SDK initialization (browser bundle).
 *
 * This file is picked up automatically by @sentry/nextjs's build plugin and
 * bundled into the client. NEXT_PUBLIC_SENTRY_DSN is inlined at build time,
 * so when it's unset the guard below compiles to false and the SDK is a
 * no-op (local dev, tests, CI).
 */
import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

/**
 * Next.js instrumentation — runs once per server runtime at boot.
 *
 * Imports the Sentry server/edge SDK configs inside register() (the v10
 * recommended layout), and hooks onRequestError so errors thrown in Server
 * Components, route handlers and middleware are captured.
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Capture errors from Server Components, route handlers, and middleware.
export const onRequestError = Sentry.captureRequestError;

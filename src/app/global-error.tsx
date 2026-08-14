'use client';

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

/**
 * App Router's root error boundary — renders when any error bubbles past the
 * nearest error.tsx. Captures the error to Sentry (no-op without a DSN) and
 * shows the default Next error page. Must define its own <html>/<body>
 * because the root layout is skipped on the error path.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* statusCode 0: the App Router does not expose HTTP status codes here. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}

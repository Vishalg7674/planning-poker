import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optional isolation: NEXT_DIST_DIR lets you build into a separate output
  // folder. Defaults to `.next` — no behavioral change.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  sassOptions: {
    // Allows SCSS modules to `@use 'styles/variables'` etc. from src/
    includePaths: ['src'],
    quietDeps: true,
  },
  // Baseline security headers (optimization.md Phase 0, T4). The CSP is
  // permissive enough not to break the app (Next.js inlines its bootstrap
  // script and dev needs 'unsafe-eval' for HMR; React sets inline style
  // attributes; the layout pulls Fraunces/Hanken Grotesk/JetBrains Mono from
  // Google Fonts) while still locking down the meaningful attack surface:
  // no cross-origin frames, no form/embed escapes, and `connect-src` only
  // allows self + the realtime WebSocket origin(s).
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || ''; // baked at build time
    const connectSrc = ["'self'", 'ws:', 'wss:', socketUrl].filter(Boolean).join(' ');
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      `connect-src ${connectSrc}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

// Sentry (error monitoring — see src/instrumentation.ts + the sentry.*.config
// files). org/project/authToken are only used to upload source maps during
// `next build`; without SENTRY_AUTH_TOKEN the runtime SDK still works but
// stack traces are un-minified-less readable. All SDKs no-op when no DSN is
// set (local dev, tests, CI without credentials).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || '',
  project: process.env.SENTRY_PROJECT || '',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only print source-map upload logs in CI, never locally.
  silent: !process.env.CI,
});

import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Reveal.
 *
 * The suite exercises the REAL application end to end: a Next.js app server
 * plus the in-memory Socket.io realtime server, both started automatically by
 * Playwright's `webServer` before the tests run.
 *
 * Ports are chosen to never collide with the developer's default stack
 * (Next :3000 + realtime :3001). The Next server is given an isolated
 * `distDir` (`.next-e2e`) via `NEXT_DIST_DIR` so it can never corrupt the
 * `.next` cache of a concurrently running `npm run dev`.
 *
 * Multiplayer tests drive separate browser contexts — one per user — exactly
 * like separate browsers (independent sessionStorage identities).
 */
const REALTIME_PORT = 3211;
const WEB_PORT = 3100;

export default defineConfig({
  testDir: './tests/e2e',
  // Each spec is a small stateful flow; a single worker keeps the countdown
  // and reveal assertions deterministic and avoids CPU contention.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      // channel 'chrome' drives the locally installed Google Chrome, so no
      // Playwright browser download is required. For CI, either keep this or
      // install the bundled Chromium: `npx playwright install --with-deps chromium`.
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: [
    {
      // 1) The in-memory Socket.io realtime server.
      // RATE_LIMIT_DISABLED: the specs create several rooms per run from one
      // IP — the Phase 0 buckets (5 creates/min) would reject them. The
      // limiter itself is covered by unit tests (tests/unit/server/rateLimit.test.ts).
      // SOCKET_ORIGIN: the app is served on WEB_PORT, so that (not the server
      // default of localhost:3000) is the origin allowed to open WebSockets.
      command: 'node server/index.mjs',
      port: REALTIME_PORT,
      env: {
        ...process.env,
        SOCKET_PORT: String(REALTIME_PORT),
        SOCKET_ORIGIN: `http://localhost:${WEB_PORT}`,
        RATE_LIMIT_DISABLED: '1',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // 2) The Next.js app server, pointed at the realtime server above.
      command: 'npx next dev -p ' + WEB_PORT,
      port: WEB_PORT,
      env: {
        ...process.env,
        SOCKET_PORT: String(REALTIME_PORT),
        NEXT_PUBLIC_SOCKET_URL: `http://localhost:${REALTIME_PORT}`,
        NEXT_DIST_DIR: '.next-e2e',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});

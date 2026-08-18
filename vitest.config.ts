import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Vitest for unit + component tests (jsdom).
 *
 * - `@` resolves to `src/` exactly like the Next.js tsconfig paths.
 * - SCSS is not processed by default (`css: false`) — components are asserted
 *   via roles / text / aria attributes, not class names, so tests stay fast
 *   and never depend on sass compilation.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/components/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/lib/**', 'src/store/**', 'src/components/**', 'server/room.mjs'],
      exclude: ['src/components/modals/**', 'src/styles/**'],
    },
  },
});

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Flat ESLint config (Next.js 15 + ESLint 9).
 *
 * Extends eslint-config-next (core-web-vitals + typescript) and adds the
 * usual ignores. `npm run lint` runs `eslint .`; `next build` also lints.
 */
const eslintConfig = defineConfig([
  globalIgnores([
    '.next/**',
    '.next-e2e/**',
    'node_modules/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The socket bridge and form ack payloads are deliberately untyped —
      // the server owns validation, the client just forwards snapshots.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);

export default eslintConfig;

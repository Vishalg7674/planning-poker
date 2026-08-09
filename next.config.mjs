/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optional isolation for the Playwright e2e app server: setting
  // NEXT_DIST_DIR keeps the test run's `.next` output separate from the one
  // the developer's `npm run dev` uses, so the two never corrupt each other's
  // compilation manifests. Defaults to `.next` — no behavioral change.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  sassOptions: {
    // Allows SCSS modules to `@use 'styles/variables'` etc. from src/
    includePaths: ['src'],
    quietDeps: true,
  },
};

export default nextConfig;

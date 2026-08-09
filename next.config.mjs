/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  sassOptions: {
    // Allows SCSS modules to `@use 'styles/variables'` etc. from src/
    includePaths: ['src'],
    quietDeps: true,
  },
};

export default nextConfig;

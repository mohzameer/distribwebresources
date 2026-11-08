import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the server bundle honest about node-only deps used by ingest scripts.
  serverExternalPackages: ['pg'],
};

export default nextConfig;

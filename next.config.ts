import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ensure server actions and images work smoothly
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async redirects() {
    return [
      {
        source: '/ajustes',
        destination: '/settings',
        permanent: false,
      },
      {
        source: '/ajuste',
        destination: '/settings',
        permanent: false,
      },
      {
        source: '/configuracion',
        destination: '/settings',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

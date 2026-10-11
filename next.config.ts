import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El demo del sitio de flexibles vive en /private (no en /public): se incluye en el paquete de la ruta que lo sirve.
  outputFileTracingIncludes: {
    '/demo/flexibles/[[...path]]': ['./private/efp/**/*'],
  },
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
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;

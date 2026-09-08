import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Both addresses refer to this computer. Keep dev assets available when the
  // server starts as localhost and the browser opens the numeric loopback URL.
  allowedDevOrigins: ['localhost', '127.0.0.1'],
};

export default nextConfig;

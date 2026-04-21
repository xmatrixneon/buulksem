/** @type {import('next').NextConfig} */
const nextConfig = {
  // eslint: {
  //   ignoreDuringBuilds: true,
  // },
  // typescript: {
  //   ignoreBuildErrors: true,
  // },
  images: {
    unoptimized: true,
  },
  // Proxy tRPC and auth requests to backend server
  // This allows cookies to work since both frontend and backend appear on same origin
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

    return [
      {
        source: '/trpc/:path*',
        destination: `${backendUrl}/trpc/:path*`,
      },
      {
        source: '/api/auth/:path*',
        destination: `${backendUrl}/api/auth/:path*`,
      },
    ];
  },
}

export default nextConfig

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Це допоможе уникнути проблем з CORS на рівні фронта
  async rewrites() {
    const apiTarget = process.env.NEXT_PUBLIC_API_BASE || "https://metodist.co.ua/api";
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;


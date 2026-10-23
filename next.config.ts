import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  /* Proxy API calls to the Rust backend so the app runs locally
     without the Caddy gateway (no XTransformPort needed). */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:3030/api/:path*",
      },
    ];
  },
};

export default nextConfig;

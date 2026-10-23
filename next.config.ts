import type { NextConfig } from "next";

/* Two build modes:
   - default (dev / `next start`)  → standalone + /api rewrite to Rust :3030
   - STATIC_EXPORT=1 (`npm run build:app`) → pure static site in out/ —
     the Rust server serves it itself on one port (Windows app mode). */
const exporting = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = exporting
  ? {
      output: "export",
      images: { unoptimized: true },
      typescript: { ignoreBuildErrors: true },
      reactStrictMode: false,
    }
  : {
      output: "standalone",
      typescript: { ignoreBuildErrors: true },
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

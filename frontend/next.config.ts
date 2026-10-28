import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};
export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      ...config,
      output: undefined,
      distDir: ".next-dev",
      async rewrites() {
        return [
          {
            source: "/api/v1/:path*",
            destination: "http://127.0.0.1:3000/api/v1/:path*",
          },
        ];
      },
    };
  }
  return config;
}

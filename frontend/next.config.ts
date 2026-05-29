import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    nodeMiddleware: true,
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.23"],
  transpilePackages: ["@chat/contracts", "@chat/utils"],
  experimental: { proxyClientMaxBodySize: "12mb" },
  async rewrites() {
    const api = (
      process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000"
    ).replace(/\/+$/, "");
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;

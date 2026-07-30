import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root so Turbopack does not walk up into a parent lockfile.
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        // The service worker must never be cached aggressively, or users get
        // stuck on a stale shell after a deploy.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const agentFiles = [
  "/agent-manifest.json",
  "/links.json",
  "/agent-mcp.json",
  "/voice_trip_concierge.network.json",
  "/city_notes.network.json",
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    const cors = [
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
      { key: "Access-Control-Allow-Headers", value: "Content-Type" },
    ];
    return agentFiles.map((source) => ({ source, headers: cors }));
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['better-sqlite3'],
  turbopack: {
    root: process.env.AGENT_KITCHEN_ROOT || "/Users/lcalderon/github/agent-kitchen",
  },
};

export default nextConfig;

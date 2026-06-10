import type { NextConfig } from "next";
import { UNDERSTAND_JSON_ROUTE_PATHS, UNDERSTAND_NOINDEX_HEADERS, toNextHeaders } from "./src/lib/understand-policy";

const UNDERSTAND_HEADERS = toNextHeaders(UNDERSTAND_NOINDEX_HEADERS);
const UNDERSTAND_JSON_ROUTE_MATCHER = `/:file(${UNDERSTAND_JSON_ROUTE_PATHS.map((routePath) =>
  routePath.replace(/^\//, "").replace(/\.json$/, "")
).join("|")}).json`;

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/understand",
        headers: UNDERSTAND_HEADERS,
      },
      {
        source: "/understand-static/:path*",
        headers: UNDERSTAND_HEADERS,
      },
      {
        source: UNDERSTAND_JSON_ROUTE_MATCHER,
        headers: UNDERSTAND_HEADERS,
      },
    ];
  },
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  serverExternalPackages: ['better-sqlite3'],
  turbopack: {
    ignoreIssue: [
      {
        path: "**/next.config.ts",
        title: "Encountered unexpected file in NFT list",
      },
    ],
  },
  outputFileTracingExcludes: {
    "/api/library/qmd-update": ["./next.config.ts"],
    "/api/**/*": ["./next.config.ts"],
    "/*": ["./next.config.ts"],
  },
  outputFileTracingIncludes: {
    "/*": ["./src/data/understand/*.json"],
  },
};

export default nextConfig;

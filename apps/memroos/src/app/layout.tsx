import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { GoogleAnalyticsTracking } from "@/components/analytics/google-analytics";
import { Shell } from "@/components/layout/shell";
import { Providers } from "./providers";
import { organizationSchema, JsonLd } from "@/lib/schema";
import { BASE_URL, OG_IMAGE_URL, SITE_NAME } from "@/lib/metadata";

const inter = Inter({ subsets: ["latin"] });
const PUBLIC_LANDING_HOSTS = new Set(["memroos.com", "www.memroos.com", "memroos.vercel.app", "memroos.localhost"]);

function isPublicLandingHost(host: string): boolean {
  const normalized = host.split(":")[0]?.toLowerCase() ?? "";
  return PUBLIC_LANDING_HOSTS.has(normalized) || normalized.endsWith(".vercel.app");
}

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Shared memory and governed orchestration for agentic product, sales, and engineering workflows. The operating layer that gives AI agents a memory and governance plane.",
  keywords: [
    "agent memory",
    "agentic memory",
    "agentic memory platform",
    "AI agent memory layer",
    "governed agent orchestration",
    "MCP memory",
  ],
  authors: [{ name: "MemroOS", url: BASE_URL }],
  creator: "MemroOS",
  publisher: "MemroOS",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: SITE_NAME,
    title: "MemroOS — Agentic Memory & Orchestration Platform",
    description:
      "Shared memory and governed orchestration for agentic product, sales, and engineering workflows.",
    images: [
      { url: OG_IMAGE_URL, width: 1200, height: 630, alt: "MemroOS — Agentic Memory Platform" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MemroOS — Agentic Memory & Orchestration Platform",
    description:
      "Shared memory and governed orchestration for agentic product, sales, and engineering workflows.",
    images: [OG_IMAGE_URL],
  },
  alternates: { canonical: BASE_URL },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get("host") ?? "";
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#fbfbf8] text-slate-950`} suppressHydrationWarning>
        <Providers>
          <Shell publicLandingHost={isPublicLandingHost(host)}>{children}</Shell>
        </Providers>
        <JsonLd data={organizationSchema()} />
      </body>
      <GoogleAnalyticsTracking />
    </html>
  );
}

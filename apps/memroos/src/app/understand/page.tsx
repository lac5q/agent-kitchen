import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Understand Graph",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
    },
  },
};

type UnderstandPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function UnderstandPage({ searchParams }: UnderstandPageProps) {
  const params = await searchParams;
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = rawToken ? encodeURIComponent(rawToken) : "";
  const src = token
    ? `/understand-static/index.html?token=${token}`
    : "/understand-static/index.html";

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#05070d]">
      <iframe
        src={src}
        title="MemRoOS Understand graph"
        className="block h-full w-full border-0"
        referrerPolicy="no-referrer"
      />
    </main>
  );
}

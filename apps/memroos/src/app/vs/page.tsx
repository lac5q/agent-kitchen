import type { Metadata } from "next";
import Link from "next/link";
import { makeTitle, makeCanonical, BASE_URL } from "@/lib/metadata";
import { COMPETITOR_SLUGS, getCompetitorData } from "./[competitor]/competitor-data";
import { faqSchema, JsonLd } from "@/lib/schema";

export const metadata: Metadata = {
  title: makeTitle("MemroOS vs Alternatives — Agentic Memory Platform Comparisons"),
  description:
    "Side-by-side comparisons of MemroOS against other agentic memory platforms. Based on the Marketplace Agentic Memory Benchmark.",
  alternates: { canonical: makeCanonical("/vs") },
  openGraph: {
    title: "MemroOS vs Alternatives | Agentic Memory Platform Comparisons",
    description: "Detailed comparisons of MemroOS against leading agentic memory platforms.",
    url: `${BASE_URL}/vs`,
  },
};

const faqs = [
  {
    question: "How does MemroOS compare to other agent memory platforms?",
    answer:
      "MemroOS scored 84/100 on the Marketplace Agentic Memory Benchmark — #1 among evaluated platforms. It leads on governed memory, orchestration integration, and observability.",
  },
];

export default function VsIndexPage() {
  const competitors = COMPETITOR_SLUGS.map((slug) => getCompetitorData(slug)).filter(Boolean);

  return (
    <>
      <JsonLd data={faqSchema(faqs)} />
      <main className="mx-auto max-w-4xl px-4 py-16">
        <nav className="mb-8 text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-900">MemroOS</Link>
          {" / "}
          <span>Comparisons</span>
        </nav>

        <h1 className="text-4xl font-bold mb-4">MemroOS vs Alternatives</h1>
        <p className="text-xl text-slate-600 mb-12">
          Detailed comparisons based on the Marketplace Agentic Memory Benchmark. MemroOS scored 84/100 — #1 among evaluated platforms.
        </p>

        <div className="space-y-4 mb-16">
          {competitors.map((comp) => (
            <a
              key={comp!.slug}
              href={`/vs/${comp!.slug}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 p-5 hover:border-[#A8392C] hover:shadow-sm transition-all"
            >
              <div>
                <h2 className="font-semibold text-lg">MemroOS vs {comp!.name}</h2>
                <p className="text-slate-600 text-sm mt-1">{comp!.shortAssessment}</p>
              </div>
              <div className="text-right flex-shrink-0 ml-6">
                <div className="text-xs text-slate-400">Benchmark score</div>
                <div className="font-bold text-[#A8392C]">84 vs {comp!.totalScore}</div>
              </div>
            </a>
          ))}
        </div>

        <div className="space-y-4 mb-12">
          {faqs.map((faq) => (
            <div key={faq.question} className="border-b border-slate-100 pb-4">
              <h3 className="font-semibold mb-2">{faq.question}</h3>
              <p className="text-slate-600">{faq.answer}</p>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

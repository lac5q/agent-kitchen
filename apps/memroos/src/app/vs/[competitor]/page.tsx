import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getCompetitorData,
  COMPETITOR_SLUGS,
  MEMROOS_SCORES,
  MEMROOS_TOTAL_SCORE,
  CRITERIA_LABELS,
} from "./competitor-data";
import { faqSchema, breadcrumbSchema, JsonLd } from "@/lib/schema";
import { makeCanonical, BASE_URL } from "@/lib/metadata";

interface Props {
  params: Promise<{ competitor: string }>;
}

export async function generateStaticParams() {
  return COMPETITOR_SLUGS.map((slug) => ({ competitor: slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competitor } = await params;
  const data = getCompetitorData(competitor);
  if (!data) return {};
  return {
    title: `MemroOS vs ${data.name}: Agentic Memory Platform Comparison`,
    description: `How does MemroOS compare to ${data.name}? Side-by-side comparison across recall quality, governed memory, enterprise deployment, and orchestration. Based on public benchmark data.`,
    alternates: { canonical: makeCanonical(`/vs/${competitor}`) },
    openGraph: {
      title: `MemroOS vs ${data.name}`,
      description: `Detailed comparison of MemroOS and ${data.name} for agentic memory and orchestration.`,
      url: `${BASE_URL}/vs/${competitor}`,
    },
  };
}

export default async function CompetitorPage({ params }: Props) {
  const { competitor } = await params;
  const data = getCompetitorData(competitor);
  if (!data) notFound();

  const criteria = Object.keys(CRITERIA_LABELS);

  const faqItems = [
    {
      question: `Is MemroOS better than ${data.name}?`,
      answer: `MemroOS scored ${MEMROOS_TOTAL_SCORE}/100 versus ${data.name}'s ${data.totalScore}/100 on the Marketplace Agentic Memory Benchmark. MemroOS leads on governed memory, orchestration, and observability. ${data.shortAssessment}`,
    },
    {
      question: `What is the difference between MemroOS and ${data.name}?`,
      answer: `MemroOS provides multi-tier typed memory (vector, graph, episodic, knowledge, skills), governed orchestration with audit lineage, and an operator NOC console. ${data.name} is a ${data.category} with different architectural priorities.`,
    },
    {
      question: `Does MemroOS support self-hosting unlike ${data.name}?`,
      answer: `Yes. MemroOS is local-first and self-hostable. Source-available under the PolyForm Small Business license.`,
    },
  ];

  const breadcrumbs = [
    { name: "MemroOS", url: BASE_URL },
    { name: "Comparisons", url: `${BASE_URL}/vs` },
    { name: `vs ${data.name}`, url: `${BASE_URL}/vs/${competitor}` },
  ];

  const whyReasons = [
    "Governed memory with per-agent write paths and full audit lineage",
    "Multi-tier typed memory: vector, graph, episodic, knowledge, and skill surfaces",
    "Orchestration integrated with memory — pause, inspect, retry, roll back",
    "Local-first, self-hosted, source-available — you own your data",
    "NOC console: live visibility into memory health and agent activity",
  ];

  return (
    <>
      <JsonLd data={faqSchema(faqItems)} />
      <JsonLd data={breadcrumbSchema(breadcrumbs)} />
      <main className="mx-auto max-w-4xl px-4 py-16">
        <nav className="mb-8 text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-900">MemroOS</Link>
          {" / "}
          <span>MemroOS vs {data.name}</span>
        </nav>

        <h1 className="text-4xl font-bold mb-4">MemroOS vs {data.name}</h1>
        <p className="text-xl text-slate-600 mb-12">{data.shortAssessment}</p>

        <div className="grid grid-cols-2 gap-6 mb-12">
          <div className="rounded-xl border border-slate-200 p-6 text-center">
            <div className="text-5xl font-bold text-[#A8392C] mb-2">{MEMROOS_TOTAL_SCORE}</div>
            <div className="text-lg font-semibold">MemroOS</div>
            <div className="text-sm text-slate-500">Benchmark Score (/100)</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-6 text-center">
            <div className="text-5xl font-bold text-slate-400 mb-2">{data.totalScore}</div>
            <div className="text-lg font-semibold">{data.name}</div>
            <div className="text-sm text-slate-500">Benchmark Score (/100)</div>
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-6">Detailed Comparison</h2>
        <div className="overflow-x-auto mb-12">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 pr-4 font-semibold">Criterion</th>
                <th className="text-center py-3 px-4 font-semibold">MemroOS</th>
                <th className="text-center py-3 px-4 font-semibold">{data.name}</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((key) => (
                <tr key={key} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium">{CRITERIA_LABELS[key]}</td>
                  <td className="py-3 px-4 text-center font-bold text-[#A8392C]">
                    {MEMROOS_SCORES[key]?.score ?? "—"}/5
                  </td>
                  <td className="py-3 px-4 text-center text-slate-500">
                    {data.scores[key]?.score ?? "—"}/5
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="text-2xl font-bold mb-4">Why Teams Choose MemroOS</h2>
        <ul className="space-y-3 mb-12 text-slate-700">
          {whyReasons.map((reason) => (
            <li key={reason} className="flex gap-3">
              <span className="text-[#A8392C] font-bold flex-shrink-0">✓</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>

        <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
        <div className="space-y-6 mb-16">
          {faqItems.map((item) => (
            <div key={item.question}>
              <h3 className="font-semibold mb-2">{item.question}</h3>
              <p className="text-slate-600">{item.answer}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl bg-[#F2E2DC]/40 border border-[#A8392C]/30 p-8 text-center">
          <h2 className="text-2xl font-bold mb-3">Try MemroOS</h2>
          <p className="text-slate-600 mb-6">Self-hosted, source-available, ready in 5 minutes.</p>
          <a
            href="https://github.com/lac5q/memroos"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 text-white px-6 py-3 font-semibold hover:bg-slate-800 hover:shadow-[inset_0_-3px_0_#A8392C] transition-all"
          >
            View on GitHub →
          </a>
        </div>
      </main>
    </>
  );
}

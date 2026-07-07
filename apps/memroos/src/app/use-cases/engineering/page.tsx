import type { Metadata } from "next";
import Link from "next/link";
import { faqSchema, JsonLd } from "@/lib/schema";
import { makeTitle, makeCanonical, BASE_URL } from "@/lib/metadata";

export const metadata: Metadata = {
  title: makeTitle("Engineering Agent Memory — AI Context for Dev Teams"),
  description:
    "Engineering agents with persistent memory of architecture decisions, incidents, deploy fixes, and repo patterns. MemroOS gives your dev agents the context they need.",
  keywords: [
    "engineering agent memory",
    "AI context for devs",
    "architecture decision memory",
    "AI coding agent memory",
  ],
  alternates: { canonical: makeCanonical("/use-cases/engineering") },
  openGraph: {
    title: "Engineering Agent Memory | MemroOS",
    description:
      "Dev agents that remember architecture decisions, incidents, and deploy patterns.",
    url: `${BASE_URL}/use-cases/engineering`,
  },
};

const retained = [
  "Architecture decisions and their rationale",
  "Incident post-mortems and root causes",
  "Deploy fixes and rollback patterns",
  "Repo patterns and coding conventions",
];

const consumed = [
  "Debug plans with relevant incident history",
  "Code reviews informed by architectural context",
  "Migration plans grounded in past decisions",
  "Onboarding docs built from real institutional knowledge",
];

const faqs = [
  {
    question: "How does MemroOS help engineering teams?",
    answer:
      "MemroOS retains architecture decisions, incidents, deploy fixes, and repo patterns — making institutional knowledge available for debug plans, code reviews, migrations, onboarding, and runbooks.",
  },
  {
    question: "How does MemroOS integrate with developer tools?",
    answer:
      "MemroOS integrates with Claude Code via MCP, supports LangGraph agents, and can ingest data from GitHub, incident tools, and CI/CD systems. Dev agents can query memory at runtime before starting work.",
  },
];

export default function EngineeringUseCasePage() {
  return (
    <>
      <JsonLd data={faqSchema(faqs)} />
      <main className="mx-auto max-w-4xl px-4 py-16">
        <nav className="mb-8 text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-900">MemroOS</Link>
          {" / "}
          <Link href="/use-cases" className="hover:text-slate-900">Use Cases</Link>
          {" / "}
          <span>Engineering</span>
        </nav>

        <h1 className="text-5xl font-bold mb-6">Engineering Agent Memory</h1>
        <p className="text-xl text-slate-600 mb-12">
          Dev agents that never forget an architecture decision, deploy fix, or incident post-mortem.
          Institutional knowledge that survives team handoffs.
        </p>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div>
            <h2 className="text-2xl font-bold mb-4">What Engineering Teams Retain</h2>
            <ul className="space-y-2 text-slate-700">
              {retained.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-[#A8392C] font-bold flex-shrink-0">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-4">What Dev Agents Consume</h2>
            <ul className="space-y-2 text-slate-700">
              {consumed.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-[#A8392C] font-bold flex-shrink-0">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-6 mb-12">
          {faqs.map((faq) => (
            <div key={faq.question} className="border-b border-slate-100 pb-6">
              <h3 className="font-semibold mb-2">{faq.question}</h3>
              <p className="text-slate-600">{faq.answer}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <a
            href="https://github.com/lac5q/memroos"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 text-white px-6 py-3 font-semibold hover:bg-slate-800 hover:shadow-[inset_0_-3px_0_#A8392C] transition-all"
          >
            Get Started →
          </a>
          <Link
            href="/blog/engineering-ai-memory"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-6 py-3 font-semibold hover:border-slate-400 transition-colors"
          >
            Read: Engineering AI Memory Guide
          </Link>
        </div>
      </main>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { faqSchema, JsonLd } from "@/lib/schema";
import { makeTitle, makeCanonical, BASE_URL } from "@/lib/metadata";

export const metadata: Metadata = {
  title: makeTitle("AI Agent CRM Memory for Sales Teams"),
  description:
    "Sales agents with persistent CRM memory. MemroOS retains call takeaways, buyer preferences, and competitor mentions so your sales AI always has full context.",
  keywords: [
    "AI agent CRM memory",
    "sales AI context",
    "sales agent memory",
    "AI sales assistant memory",
  ],
  alternates: { canonical: makeCanonical("/use-cases/sales") },
  openGraph: {
    title: "AI Agent CRM Memory for Sales | MemroOS",
    description:
      "Sales agents that remember every call, buyer preference, and competitor mention.",
    url: `${BASE_URL}/use-cases/sales`,
  },
};

const retained = [
  "CRM notes and call takeaways",
  "Buyer preferences and decision criteria",
  "Competitor mentions and objection patterns",
  "Deal history and expansion signals",
];

const consumed = [
  "Account briefs with full buyer context",
  "Talk tracks tuned to buyer history",
  "Follow-up emails grounded in actual conversation",
  "Expansion plans informed by usage signals",
];

const faqs = [
  {
    question: "How does MemroOS help sales teams?",
    answer:
      "MemroOS retains CRM notes, call takeaways, buyer preferences, and competitor mentions — making that context available for account briefs, talk tracks, follow-up messages, and expansion plans.",
  },
  {
    question: "Does MemroOS integrate with our CRM?",
    answer:
      "MemroOS ingests structured data from CRM systems via webhooks and REST APIs. Call transcripts, deal notes, and contact records all become memory that sales agents can query at runtime.",
  },
];

export default function SalesUseCasePage() {
  return (
    <>
      <JsonLd data={faqSchema(faqs)} />
      <main className="mx-auto max-w-4xl px-4 py-16">
        <nav className="mb-8 text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-900">MemroOS</Link>
          {" / "}
          <Link href="/use-cases" className="hover:text-slate-900">Use Cases</Link>
          {" / "}
          <span>Sales</span>
        </nav>

        <h1 className="text-5xl font-bold mb-6">AI Agent CRM Memory for Sales</h1>
        <p className="text-xl text-slate-600 mb-12">
          Sales agents that remember every call, buyer preference, objection, and competitor mention
          — and use that context for every workflow.
        </p>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div>
            <h2 className="text-2xl font-bold mb-4">What Sales Teams Retain</h2>
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
            <h2 className="text-2xl font-bold mb-4">What Sales Agents Consume</h2>
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
            href="/blog/sales-ai-agent-memory"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-6 py-3 font-semibold hover:border-slate-400 transition-colors"
          >
            Read: Sales AI Memory Guide
          </Link>
        </div>
      </main>
    </>
  );
}

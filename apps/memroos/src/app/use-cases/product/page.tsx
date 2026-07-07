import type { Metadata } from "next";
import Link from "next/link";
import { faqSchema, JsonLd } from "@/lib/schema";
import { makeTitle, makeCanonical, BASE_URL } from "@/lib/metadata";

export const metadata: Metadata = {
  title: makeTitle("AI Memory for Product Teams"),
  description:
    "Give your product agents persistent memory across customer interviews, launch learnings, roadmap decisions, and objections. MemroOS keeps product context available for every AI workflow.",
  keywords: [
    "AI memory for product teams",
    "product agent context",
    "AI product management",
    "agentic product workflows",
  ],
  alternates: { canonical: makeCanonical("/use-cases/product") },
  openGraph: {
    title: "AI Memory for Product Teams | MemroOS",
    description:
      "Product agents that remember customer interviews, launch learnings, and roadmap decisions.",
    url: `${BASE_URL}/use-cases/product`,
  },
};

const retained = [
  "Customer interviews and feedback sessions",
  "Launch learnings and post-mortems",
  "Competitive objections and win/loss patterns",
  "Roadmap decisions and the reasoning behind them",
];

const consumed = [
  "PRDs with relevant historical context",
  "Prioritization with customer signal backing",
  "Release notes grounded in actual decisions",
  "Beta follow-up with full customer history",
];

const faqs = [
  {
    question: "How does MemroOS help product teams?",
    answer:
      "MemroOS retains customer interviews, launch learnings, objections, and roadmap decisions — making that context available to every product agent for PRDs, prioritization, release notes, and beta follow-up.",
  },
  {
    question: "Can MemroOS connect to our product documents?",
    answer:
      "Yes. MemroOS ingests documents, conversations, and structured data as knowledge sources. Product docs, Notion pages, and meeting transcripts all become retrievable context for your agents.",
  },
];

export default function ProductUseCasePage() {
  return (
    <>
      <JsonLd data={faqSchema(faqs)} />
      <main className="mx-auto max-w-4xl px-4 py-16">
        <nav className="mb-8 text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-900">MemroOS</Link>
          {" / "}
          <Link href="/use-cases" className="hover:text-slate-900">Use Cases</Link>
          {" / "}
          <span>Product</span>
        </nav>

        <h1 className="text-5xl font-bold mb-6">AI Memory for Product Teams</h1>
        <p className="text-xl text-slate-600 mb-12">
          Product agents that remember customer interviews, launch learnings, objections, and
          roadmap decisions — and make that knowledge available across every workflow.
        </p>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div>
            <h2 className="text-2xl font-bold mb-4">What Product Teams Retain</h2>
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
            <h2 className="text-2xl font-bold mb-4">What Product Agents Consume</h2>
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
            href="/blog/ai-agent-context-management"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-6 py-3 font-semibold hover:border-slate-400 transition-colors"
          >
            Read: Context Management Guide
          </Link>
        </div>
      </main>
    </>
  );
}

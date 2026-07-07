import type { Metadata } from "next";
import Link from "next/link";
import { makeTitle, makeCanonical, BASE_URL } from "@/lib/metadata";
import { faqSchema, JsonLd } from "@/lib/schema";

export const metadata: Metadata = {
  title: makeTitle("AI Agent Memory Use Cases"),
  description:
    "MemroOS gives AI agents persistent memory for product, sales, and engineering workflows. Explore use cases by team.",
  alternates: { canonical: makeCanonical("/use-cases") },
  openGraph: {
    title: "AI Agent Memory Use Cases | MemroOS",
    description: "Persistent agent memory for product, sales, and engineering teams.",
    url: `${BASE_URL}/use-cases`,
  },
};

const useCases = [
  {
    href: "/use-cases/product",
    title: "Product Teams",
    description:
      "Retain customer interviews, launch learnings, objections, and roadmap decisions across every product agent workflow.",
  },
  {
    href: "/use-cases/sales",
    title: "Sales Teams",
    description:
      "CRM memory for sales agents: call takeaways, buyer preferences, competitor mentions, and deal history.",
  },
  {
    href: "/use-cases/engineering",
    title: "Engineering Teams",
    description:
      "Architecture decisions, incident post-mortems, deploy fixes, and repo patterns — preserved for dev agents.",
  },
];

const faqs = [
  {
    question: "What teams does MemroOS support?",
    answer:
      "MemroOS supports product, sales, and engineering teams with purpose-built memory configurations for each workflow type.",
  },
];

export default function UseCasesPage() {
  return (
    <>
      <JsonLd data={faqSchema(faqs)} />
      <main className="mx-auto max-w-4xl px-4 py-16">
        <nav className="mb-8 text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-900">MemroOS</Link>
          {" / "}
          <span>Use Cases</span>
        </nav>

        <h1 className="text-5xl font-bold mb-6">AI Agent Memory Use Cases</h1>
        <p className="text-xl text-slate-600 mb-12">
          Persistent memory for agents across your whole organization — product, sales, and engineering.
        </p>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {useCases.map((uc) => (
            <a
              key={uc.href}
              href={uc.href}
              className="rounded-xl border border-slate-200 p-6 hover:border-[#A8392C] hover:shadow-sm transition-all"
            >
              <h2 className="text-xl font-bold mb-3">{uc.title}</h2>
              <p className="text-slate-600 text-sm leading-relaxed">{uc.description}</p>
              <span className="mt-4 inline-block text-[#A8392C] font-semibold text-sm">
                Learn more →
              </span>
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

        <div className="flex gap-4">
          <a
            href="https://github.com/lac5q/memroos"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 text-white px-6 py-3 font-semibold hover:bg-slate-800 hover:shadow-[inset_0_-3px_0_#A8392C] transition-all"
          >
            Get Started →
          </a>
          <a
            href="/platform"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-6 py-3 font-semibold hover:border-slate-400 transition-colors"
          >
            View Platform
          </a>
        </div>
      </main>
    </>
  );
}

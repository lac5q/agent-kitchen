import type { Metadata } from "next";
import Link from "next/link";
import { softwareApplicationSchema, faqSchema, speakableSchema, JsonLd } from "@/lib/schema";
import { makeTitle, makeCanonical, BASE_URL } from "@/lib/metadata";
import { Brain, GitBranch, ShieldCheck, Database, Gauge, RefreshCw } from "lucide-react";

export const metadata: Metadata = {
  title: makeTitle("Company-Owned Memory & Governance for Agent Harnesses"),
  description:
    "MemroOS is company-owned memory and governance for agent harnesses: context, permissions, dispatch, evals, and proof across models and frameworks.",
  keywords: [
    "agentic memory platform",
    "AI agent memory layer",
    "agent harness control plane",
    "AI harness governance",
    "governed agent orchestration",
    "MCP memory platform",
    "enterprise AI agent platform",
  ],
  alternates: { canonical: makeCanonical("/platform") },
  openGraph: {
    title: "MemroOS - Company-Owned Memory & Governance for Agent Harnesses",
    description:
      "Own the context, permissions, evals, dispatch, and proof layer around the agent frameworks you use.",
    url: `${BASE_URL}/platform`,
  },
};

const capabilities = [
  {
    icon: Database,
    title: "Company-Owned Context Layer",
    description:
      "Vector, graph, episodic, knowledge, and skill memory surfaces that stay in your infrastructure.",
  },
  {
    icon: ShieldCheck,
    title: "Governed Harness & Audit Trail",
    description:
      "Operator-gated write paths, per-agent permissions, and audit lineage across memory, tools, and dispatch.",
  },
  {
    icon: GitBranch,
    title: "Framework-Portable Dispatch",
    description:
      "Run Claude Code, Codex, LangGraph, ADK, CrewAI, A2A, REST, and local workers through one visible control layer.",
  },
  {
    icon: Brain,
    title: "Permission-Aware Context Assembly",
    description:
      "Context packs assembled before each agent run — agents receive only what they're authorized to use.",
  },
  {
    icon: Gauge,
    title: "Harness Operator Console",
    description:
      "Live visibility into memory health, model usage, agent activity, governance, savings, and waste.",
  },
  {
    icon: RefreshCw,
    title: "Self-Improving Moat",
    description:
      "Review, edit, approve, and promote repeated workflows into durable governed skills and playbooks.",
  },
];

const faqs = [
  {
    question: "What is agentic memory?",
    answer:
      "Agentic memory is the capability for AI agents to retain information across sessions, tasks, and handoffs. In MemroOS, that memory is structured, typed, permission-aware, and governed by the company rather than trapped in one vendor harness.",
  },
  {
    question: "What is an agent harness?",
    answer:
      "An agent harness is the work layer around a model: tools, files, permissions, memory, evals, routing, dispatch, and the workflow rules that define what done means.",
  },
  {
    question: "How is MemroOS different from a vector database?",
    answer:
      "A vector database stores embeddings for semantic search. MemroOS adds governance (who can write/read what), typed memory tiers (episodic, procedural, semantic, declarative), orchestration integration, and an operator console.",
  },
  {
    question: "Does MemroOS support self-hosting?",
    answer:
      "Yes. MemroOS is local-first and self-hosted by default. Your data never leaves your network. Source-available under the PolyForm Small Business license.",
  },
  {
    question: "What AI agent frameworks does MemroOS integrate with?",
    answer:
      "MemroOS integrates with Claude Code and Codex-style workflows through MCP and REST surfaces, plus LangGraph, CrewAI, AutoGen, Google ADK, A2A, and custom REST-capable agents.",
  },
];

export default function PlatformPage() {
  return (
    <>
      <JsonLd data={softwareApplicationSchema()} />
      <JsonLd data={faqSchema(faqs)} />
      <JsonLd data={speakableSchema(["h1", "h2", ".platform-description"])} />

      <main className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6">
            Company-Owned Memory &amp; Governance for Agent Harnesses
          </h1>
          <p className="platform-description text-xl text-slate-600 max-w-2xl mx-auto">
            MemroOS keeps your context, permissions, evals, dispatch, and proof layer outside any
            single model vendor or framework. Use the best agents without renting away the memory
            layer that makes them useful.
          </p>
          <div className="mt-8 flex gap-4 justify-center">
            <a
              href="https://github.com/lac5q/memroos"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 text-white px-6 py-3 font-semibold hover:bg-slate-800 hover:shadow-[inset_0_-3px_0_#A8392C] transition-all"
            >
              Get Started →
            </a>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-6 py-3 font-semibold hover:border-slate-400 transition-colors"
            >
              Read the Blog
            </Link>
          </div>
        </div>

        <h2 className="text-3xl font-bold text-center mb-10">Harness Control Capabilities</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {capabilities.map((cap) => (
            <div key={cap.title} className="rounded-xl border border-slate-200 p-6">
              <cap.icon className="h-8 w-8 text-[#A8392C] mb-4" />
              <h3 className="font-semibold text-lg mb-2">{cap.title}</h3>
              <p className="text-slate-600 text-sm">{cap.description}</p>
            </div>
          ))}
        </div>

        <h2 className="text-3xl font-bold mb-8">Frequently Asked Questions</h2>
        <div className="space-y-6 mb-16">
          {faqs.map((faq) => (
            <div key={faq.question} className="border-b border-slate-100 pb-6">
              <h3 className="font-semibold mb-2">{faq.question}</h3>
              <p className="text-slate-600">{faq.answer}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-[#F2E2DC]/40 border border-[#A8392C]/30 p-8 text-center">
          <h2 className="text-2xl font-bold mb-3">See the Benchmark</h2>
          <p className="text-slate-600 mb-6">
            MemroOS scores 84/100 on the Marketplace Agentic Memory Benchmark — #1 among evaluated
            platforms.
          </p>
          <Link
            href="/blog/agentic-memory-benchmark"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 text-white px-6 py-3 font-semibold hover:bg-slate-800 hover:shadow-[inset_0_-3px_0_#A8392C] transition-all"
          >
            View Benchmark →
          </Link>
        </div>
      </main>
    </>
  );
}

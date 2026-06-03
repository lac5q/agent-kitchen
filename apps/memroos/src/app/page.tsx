import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import {
  ArrowRight,
  Brain,
  CalendarDays,
  CheckCircle2,
  Database,
  ExternalLink,
  FileSearch,
  GitBranch,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { KangarooMark } from "@/components/layout/brand-mark";
import { OperationsNoc } from "@/components/operations";
import { softwareApplicationSchema, speakableSchema, JsonLd } from "@/lib/schema";
import { makeTitle, makeCanonical } from "@/lib/metadata";

export const metadata = {
  title: makeTitle("Agentic Memory & Orchestration Platform"),
  description:
    "MemroOS gives AI agents shared memory, governed orchestration, and an operator console for source-backed agent workflows.",
  alternates: { canonical: makeCanonical("/") },
  openGraph: {
    title: "MemroOS - Agentic Memory & Orchestration Platform",
    description:
      "Shared memory, governed orchestration, and proof surfaces for real agent workflows.",
    url: "https://memroos.com",
  },
};

const PUBLIC_LANDING_HOSTS = new Set([
  "memroos.com",
  "www.memroos.com",
  "memroos.vercel.app",
  "memroos.epiloguecapital.com",
  "memroos.localhost",
]);
const RESEARCH_PAPER_HREF = "/research/memroos-governed-knowledge-architecture-paper.pdf";
const GITHUB_REPO_HREF = "https://github.com/lac5q/memroos";
const GOOGLE_CALENDAR_HREF =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ2JkygvmpuopbcqA_NAPJZDRp0RfmZGa2x_w_oV_dFm-cYVGEyEYG9vy80meCKZzyianVC6P2vJ";

function isPublicLandingHost(host: string): boolean {
  const normalized = host.split(":")[0]?.toLowerCase() ?? "";
  return PUBLIC_LANDING_HOSTS.has(normalized) || normalized.endsWith(".vercel.app");
}

const topFeatures = [
  {
    number: "01",
    title: "Memory every agent can use",
    icon: Brain,
    summary:
      "Keep decisions, files, calls, incidents, customer context, and prior outcomes in one durable layer before the next agent starts.",
    bullets: ["Semantic, episodic, graph, and source-backed memory", "Context packs assembled before dispatch", "Outcome capture after the work ships"],
  },
  {
    number: "02",
    title: "Governed orchestration",
    icon: GitBranch,
    summary:
      "Run long agent workflows with visible state, human review, retry paths, and audit trails instead of opaque one-shot automation.",
    bullets: ["Operator NOC for live work", "Human-in-the-loop approval surfaces", "Lineage for memory, tools, checks, and residual risk"],
  },
  {
    number: "03",
    title: "Interop plus evidence",
    icon: MessageSquareText,
    summary:
      "Connect local agents, REST workers, MCP-facing context, and A2A-style cards while preserving proof of what each agent consumed.",
    bullets: ["Claude Code, Codex, ADK, LangGraph, CrewAI, and custom workers", "Agent registry with capabilities", "Source proof, evals, and public benchmark notes"],
  },
];

const proofStats = [
  {
    value: "84.06",
    label: "live beta score",
    detail: "Ranked first in the public-evidence agentic-memory benchmark.",
  },
  {
    value: "8/8",
    label: "recall gate",
    detail: "Local suite passed across vector, graph, episodic, and qmd tiers.",
  },
  {
    value: "469 ms",
    label: "p95 recall",
    detail: "Latest authenticated eval run completed without tier failures.",
  },
];

const productShots = [
  {
    title: "Operator NOC",
    image: "/screenshots/memroos-floor.png",
    alt: "MemroOS operator NOC showing memory consumption, workload, model utility, governance, and agent activity panels.",
    detail: "See memory health, agent workload, model utility, and trust signals in one place.",
  },
  {
    title: "Memory",
    image: "/screenshots/readme-memory.png",
    alt: "MemroOS memory page with retained context search and memory activity surfaces.",
    detail: "Search retained context, then trace what each agent consumed before acting.",
  },
  {
    title: "Dispatch",
    image: "/screenshots/readme-dispatch.png",
    alt: "MemroOS dispatch page with agent cards, live delegations, and task state.",
    detail: "Send work to local, REST, and A2A-style agents from one governed registry.",
  },
];

const memoryLoop = [
  { label: "Capture", icon: Database, detail: "Files, calls, chats, commits, and outcomes enter the governed memory plane." },
  { label: "Retrieve", icon: FileSearch, detail: "Agents receive the smallest useful context pack before the next action." },
  { label: "Act", icon: GitBranch, detail: "Work runs through visible state, dispatch, approvals, and audit lineage." },
  { label: "Prove", icon: ShieldCheck, detail: "Every run can show the memory used, tools touched, checks passed, and gaps left." },
];

function LandingPage() {
  return (
    <>
      <JsonLd data={softwareApplicationSchema()} />
      <JsonLd data={speakableSchema(["h1", "h2", ".hero-tagline"])} />
      <main className="min-h-screen overflow-hidden bg-[#fafafa] text-[#1f1f1c]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
        <header className="sticky top-0 z-40 border-b border-[#cccccc] bg-[#fafafa]/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="MemroOS home">
              <KangarooMark className="h-11 w-11 shrink-0" />
              <div className="min-w-0">
                <p className="text-[18px] font-semibold leading-none text-[#0f0f0e]">MemroOS</p>
                <p className="mt-1 hidden text-[12px] uppercase tracking-[0.12em] text-[#4a4a45] sm:block">
                  Memory OS for agent workflows
                </p>
              </div>
            </Link>
            <nav className="flex items-center gap-2">
              <Link
                href="#features"
                className="hidden px-3 py-2 text-[13px] font-semibold text-[#4a4a45] transition hover:text-[#0f0f0e] md:inline-flex"
              >
                Features
              </Link>
              <Link
                href="#proof"
                className="hidden px-3 py-2 text-[13px] font-semibold text-[#4a4a45] transition hover:text-[#0f0f0e] md:inline-flex"
              >
                Proof
              </Link>
              <Link
                href={GITHUB_REPO_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden border border-[#0f0f0e] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0f0f0e] transition hover:bg-[#0f0f0e] hover:text-white sm:inline-flex"
              >
                GitHub
              </Link>
              <Link
                href="#schedule"
                className="inline-flex items-center gap-2 bg-[#0f0f0e] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#a8392c]"
              >
                Schedule
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
              </Link>
            </nav>
          </div>
        </header>

        <section className="border-b border-[#cccccc]">
          <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:py-20">
            <div className="mk-reveal">
              <h1 className="max-w-[11ch] text-[clamp(58px,9vw,118px)] font-semibold leading-none tracking-normal text-[#0f0f0e]">
                MemroOS
              </h1>
              <p className="hero-tagline mt-6 max-w-[56ch] text-[clamp(22px,3vw,34px)] leading-tight text-[#1f1f1c]">
                Shared memory for agents that do real work.
              </p>
              <p className="mt-5 max-w-[64ch] text-[18px] leading-8 text-[#4a4a45]">
                MemroOS gives AI-native teams a retained context plane, governed agent dispatch, and proof surfaces that show what memory was used before work moved forward.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={GOOGLE_CALENDAR_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-[#a8392c] px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#7a2a1e]"
                >
                  Schedule on Google Calendar
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href={GITHUB_REPO_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 border border-[#0f0f0e] px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#0f0f0e] transition hover:bg-[#0f0f0e] hover:text-white"
                >
                  View source
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <div className="mt-9 grid gap-px bg-[#cccccc] sm:grid-cols-3">
                {["shared memory", "governed dispatch", "source-backed proof"].map((signal) => (
                  <div key={signal} className="bg-[#fafafa] p-4">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#a8392c]">Built for</p>
                    <p className="mt-2 text-[19px] font-semibold text-[#0f0f0e]">{signal}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mk-reveal mk-reveal-delay-1 border border-[#0f0f0e] bg-white p-3 shadow-[0_24px_48px_rgba(15,15,14,0.12)]">
              <div className="flex items-center justify-between border-b border-[#cccccc] bg-[#fafafa] px-4 py-3">
                <div className="flex items-center gap-3">
                  <KangarooMark className="h-10 w-10" />
                  <div>
                    <p className="text-[14px] font-semibold text-[#0f0f0e]">Live operator surface</p>
                    <p className="text-[13px] text-[#4a4a45]">Memory, dispatch, governance</p>
                  </div>
                </div>
                <span className="border border-[#f2e2dc] bg-[#f2e2dc] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a2a1e]">
                  proof
                </span>
              </div>
              <div className="relative aspect-[16/10] overflow-hidden bg-[#0f0f0e]">
                <Image
                  src="/screenshots/memroos-floor.png"
                  alt="MemroOS operator NOC with memory, workload, governance, and activity panels."
                  fill
                  priority
                  unoptimized
                  sizes="(max-width: 1024px) 100vw, 620px"
                  className="object-cover object-top"
                  style={{ objectPosition: "left top" }}
                />
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-b border-[#cccccc] bg-white">
          <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#a8392c]">
                  The top three MemroOS features
                </p>
                <h2 className="mt-3 text-[clamp(38px,5vw,64px)] font-semibold leading-tight tracking-normal text-[#0f0f0e]">
                  Less surface area. More retained context.
                </h2>
              </div>
              <p className="text-[18px] leading-8 text-[#4a4a45]">
                The product priority is simple: help agents remember the company, govern the run, and prove what happened. Everything else supports those three jobs.
              </p>
            </div>

            <div className="mt-10 divide-y divide-[#cccccc] border-y border-[#cccccc]">
              {topFeatures.map((feature) => (
                <article key={feature.title} className="grid gap-6 py-8 lg:grid-cols-[90px_270px_1fr]">
                  <div className="flex items-center justify-between gap-4 lg:block">
                    <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#a8392c]">{feature.number}</p>
                    <span className="mt-4 flex h-12 w-12 items-center justify-center border border-[#cccccc] bg-[#fafafa] text-[#a8392c]">
                      <feature.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="text-[28px] font-semibold leading-tight text-[#0f0f0e]">{feature.title}</h3>
                  <div>
                    <p className="max-w-[68ch] text-[17px] leading-8 text-[#4a4a45]">{feature.summary}</p>
                    <ul className="mt-5 grid gap-3 sm:grid-cols-3">
                      {feature.bullets.map((bullet) => (
                        <li key={bullet} className="flex gap-3 border-l-2 border-[#a8392c] bg-[#fafafa] px-4 py-3 text-[14px] leading-6 text-[#4a4a45]">
                          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#a8392c]" aria-hidden="true" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="proof" className="border-b border-[#0f0f0e] bg-[#0f0f0e] text-white">
          <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
            <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#e7b6a8]">Proof without the wall of text</p>
                <h2 className="mt-3 text-[clamp(38px,5vw,64px)] font-semibold leading-tight tracking-normal text-white">
                  Public evidence, live product surfaces, and a readable paper trail.
                </h2>
              </div>
              <p className="text-[18px] leading-8 text-[#d8d4cb]">
                The governed knowledge architecture paper explains progressive disclosure, governed writes, dual-index retrieval, and the retain-retrieve-prove loop behind the benchmark.
              </p>
            </div>

            <div className="mt-10 grid gap-px bg-[#4a4a45] md:grid-cols-3">
              {proofStats.map((stat) => (
                <article key={stat.label} className="bg-[#171715] p-6">
                  <p className="text-[48px] font-semibold leading-none text-[#e7b6a8]">{stat.value}</p>
                  <h3 className="mt-5 text-[18px] font-semibold text-white">{stat.label}</h3>
                  <p className="mt-3 text-[15px] leading-7 text-[#d8d4cb]">{stat.detail}</p>
                </article>
              ))}
            </div>

            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {productShots.map((shot) => (
                <figure key={shot.title} className="border border-[#4a4a45] bg-[#171715]">
                  <div className="relative aspect-[16/10] w-full bg-[#080a12]">
                    <Image
                      src={shot.image}
                      alt={shot.alt}
                      fill
                      unoptimized
                      sizes="(max-width: 1024px) 100vw, 380px"
                      className="object-cover object-top"
                      style={{ objectPosition: "left top" }}
                    />
                  </div>
                  <figcaption className="border-t border-[#4a4a45] p-5">
                    <h3 className="text-[20px] font-semibold text-white">{shot.title}</h3>
                    <p className="mt-2 text-[15px] leading-7 text-[#d8d4cb]">{shot.detail}</p>
                  </figcaption>
                </figure>
              ))}
            </div>

            <div className="mt-10 grid gap-5 border border-[#4a4a45] bg-[#171715] p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#e7b6a8]">Research paper</p>
                <h3 className="mt-3 text-[26px] font-semibold leading-tight text-white">
                  Read the governed knowledge architecture behind MemroOS.
                </h3>
                <p className="mt-3 max-w-[78ch] text-[15px] leading-7 text-[#d8d4cb]">
                  Source notes and methodology stay close to the product so benchmark claims remain inspectable.
                </p>
              </div>
              <a
                href={RESEARCH_PAPER_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 border border-[#e7b6a8] px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#e7b6a8] transition hover:bg-[#e7b6a8] hover:text-[#0f0f0e] md:w-auto"
              >
                Read the research paper
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <section className="border-b border-[#cccccc] bg-[#fafafa]">
          <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#a8392c]">Operating loop</p>
                <h2 className="mt-3 text-[clamp(38px,5vw,64px)] font-semibold leading-tight tracking-normal text-[#0f0f0e]">
                  The whole system fits in four verbs.
                </h2>
              </div>
              <div className="grid gap-px bg-[#cccccc] sm:grid-cols-2">
                {memoryLoop.map((step) => (
                  <article key={step.label} className="bg-white p-6">
                    <span className="flex h-10 w-10 items-center justify-center bg-[#f2e2dc] text-[#a8392c]">
                      <step.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-[24px] font-semibold text-[#0f0f0e]">{step.label}</h3>
                    <p className="mt-3 text-[16px] leading-7 text-[#4a4a45]">{step.detail}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="schedule" className="bg-white">
          <div className="mx-auto grid max-w-[1180px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-start lg:py-20">
            <div>
              <div className="flex items-center gap-4">
                <KangarooMark className="h-12 w-12" />
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#a8392c]">Schedule</p>
              </div>
              <h2 className="mt-6 max-w-[17ch] text-[clamp(38px,5vw,62px)] font-semibold leading-tight tracking-normal text-[#0f0f0e]">
                Talk through your agent memory stack.
              </h2>
              <p className="mt-5 max-w-[58ch] text-[18px] leading-8 text-[#4a4a45]">
                Bring one workflow where agents keep rediscovering the same context. The first call should leave with a practical memory, governance, and proof map.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={GOOGLE_CALENDAR_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-[#a8392c] px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#7a2a1e]"
                >
                  Schedule on Google Calendar
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href={GITHUB_REPO_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 border border-[#0f0f0e] px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#0f0f0e] transition hover:bg-[#0f0f0e] hover:text-white"
                >
                  GitHub repo
                </Link>
              </div>
            </div>

            <div className="border border-[#0f0f0e] bg-[#fafafa] p-6 shadow-[0_24px_48px_rgba(15,15,14,0.08)]">
              <div className="flex items-center justify-between gap-4 border-b border-[#cccccc] pb-5">
                <div>
                  <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#a8392c]">Why the embedded calendar failed</p>
                  <h3 className="mt-3 text-[30px] font-semibold leading-tight text-[#0f0f0e]">Google wants the scheduler opened directly.</h3>
                </div>
                <CalendarDays className="h-8 w-8 shrink-0 text-[#a8392c]" aria-hidden="true" />
              </div>
              <p className="mt-5 text-[17px] leading-8 text-[#4a4a45]">
                Google blocks this appointment scheduler inside many embedded iframes, which makes the old page look like the schedule is broken. The reliable path is a direct link that opens Google Calendar in a new tab.
              </p>
              <div className="mt-6 grid gap-px bg-[#cccccc] sm:grid-cols-3">
                {["No blank embed", "Direct Google session", "Mobile friendly"].map((item) => (
                  <div key={item} className="bg-white p-4">
                    <CheckCircle2 className="h-5 w-5 text-[#a8392c]" aria-hidden="true" />
                    <p className="mt-3 text-[15px] font-semibold text-[#0f0f0e]">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

export default async function HomePage() {
  const host = (await headers()).get("host") ?? "";
  return isPublicLandingHost(host) ? <LandingPage /> : <OperationsNoc />;
}

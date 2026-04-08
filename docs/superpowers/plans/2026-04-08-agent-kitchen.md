# Agent Kitchen Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a beautiful, restaurant-themed observability dashboard for AI agent infrastructure with 5 views: Kitchen Floor, Ledger, Notebook Wall, Library, and Flow.

**Architecture:** Next.js 15 App Router with API routes polling local services (RTK, mem0, QMD, filesystem). Client-side data fetching via TanStack Query. Dark theme with warm restaurant aesthetic using shadcn/ui + Recharts + Framer Motion.

**Tech Stack:** Next.js 15, Tailwind CSS 4, shadcn/ui, Recharts, Framer Motion, TanStack Query, Vitest, React Testing Library

**Security note:** Use `execFile`/`execFileSync` (not `exec`/`execSync`) for shell commands to prevent injection.

---

## Wave 1: Foundation (Tasks 1-2) — No dependencies

### Task 1: Project Scaffolding & App Shell

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx` (placeholder)
- Create: `src/app/globals.css`
- Create: `src/components/layout/sidebar.tsx`
- Create: `src/components/layout/top-bar.tsx`
- Create: `src/components/layout/health-dot.tsx`
- Create: `src/lib/constants.ts`
- Create: `src/types/index.ts`
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd /Users/lcalderon/github/agent-kitchen
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack --yes
```

Expected: Project created with `src/app/` structure, `package.json` present.

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/lcalderon/github/agent-kitchen
npm install @tanstack/react-query recharts framer-motion react-markdown
npm install -D vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom
```

- [ ] **Step 3: Initialize shadcn/ui**

```bash
cd /Users/lcalderon/github/agent-kitchen
npx shadcn@latest init --defaults
npx shadcn@latest add card badge tabs sheet button input separator tooltip
```

- [ ] **Step 4: Create TypeScript types**

Write `src/types/index.ts`:

```typescript
export type AgentStatus = "active" | "idle" | "dormant" | "error";

export type AgentPlatform = "claude" | "codex" | "qwen" | "gemini" | "opencode";

export interface Agent {
  id: string;
  name: string;
  role: string;
  platform: AgentPlatform;
  status: AgentStatus;
  lastHeartbeat: string | null;
  currentTask: string | null;
  lessonsCount: number;
  todayMemoryCount: number;
}

export interface TokenStats {
  totalInput: number;
  totalOutput: number;
  tokensSaved: number;
  savingsPercent: number;
  totalCommands: number;
  avgExecutionTime: number;
  commandBreakdown: CommandSavings[];
}

export interface CommandSavings {
  command: string;
  count: number;
  tokensUsed: number;
  tokensSaved: number;
}

export interface MemoryEntry {
  id: string;
  content: string;
  agent: string;
  date: string;
  type: "user" | "feedback" | "project" | "reference" | "daily";
  source: string;
  score?: number;
}

export interface KnowledgeCollection {
  name: string;
  docCount: number;
  category: "business" | "agents" | "marketing" | "product" | "other";
  lastUpdated: string | null;
}

export interface HealthStatus {
  service: string;
  status: "up" | "degraded" | "down";
  latencyMs: number | null;
  lastCheck: string;
}

export interface FlowNode {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  x: number;
  y: number;
  status: "active" | "idle" | "error";
  stats: Record<string, string | number>;
}

export interface FlowEdge {
  from: string;
  to: string;
  type: "request" | "knowledge" | "memory" | "error";
}
```

- [ ] **Step 5: Create constants**

Write `src/lib/constants.ts`:

```typescript
export const POLL_INTERVALS = {
  agents: 5000,
  tokens: 30000,
  memory: 15000,
  knowledge: 60000,
  health: 10000,
} as const;

export const COLORS = {
  bg: "hsl(222.2, 84%, 4.9%)",
  accent: "#f59e0b",
  success: "#10b981",
  danger: "#f43f5e",
  info: "#0ea5e9",
  muted: "#64748b",
  cardBg: "hsl(222.2, 84%, 6.9%)",
} as const;

export const STATUS_COLORS: Record<string, string> = {
  active: COLORS.success,
  idle: COLORS.accent,
  dormant: COLORS.muted,
  error: COLORS.danger,
  up: COLORS.success,
  degraded: COLORS.accent,
  down: COLORS.danger,
};

export const PLATFORM_LABELS: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  qwen: "Qwen",
  gemini: "Gemini",
  opencode: "OpenCode",
};

export const AGENT_CONFIGS_PATH = process.env.AGENT_CONFIGS_PATH || `${process.env.HOME}/github/knowledge/agent-configs`;
export const PMO_MEMORY_PATH = process.env.PMO_MEMORY_PATH || `${process.env.HOME}/github/PMO/memory`;
export const CLAUDE_MEMORY_PATH = process.env.CLAUDE_MEMORY_PATH || `${process.env.HOME}/.claude/projects`;
export const MEM0_URL = process.env.MEM0_URL || "http://localhost:3201";
```

- [ ] **Step 6: Create Sidebar component**

Write `src/components/layout/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Kitchen Floor", icon: "\u{1F468}\u200D\u{1F373}" },
  { href: "/ledger", label: "The Ledger", icon: "\u{1F9FE}" },
  { href: "/notebooks", label: "Notebook Wall", icon: "\u{1F9E0}" },
  { href: "/library", label: "The Library", icon: "\u{1F4DA}" },
  { href: "/flow", label: "The Flow", icon: "\u{1F504}" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-950 px-4 py-6">
      <div className="mb-8 px-2">
        <h1 className="text-xl font-bold text-amber-500">Agent Kitchen</h1>
        <p className="text-xs text-slate-500">Knowledge Restaurant</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-amber-500/10 text-amber-500"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 pt-4 px-2">
        <p className="text-xs text-slate-600">v1.0.0</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 7: Create HealthDot component**

Write `src/components/layout/health-dot.tsx`:

```tsx
"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { STATUS_COLORS } from "@/lib/constants";

interface HealthDotProps {
  service: string;
  status: "up" | "degraded" | "down";
  latencyMs: number | null;
}

export function HealthDot({ service, status, latencyMs }: HealthDotProps) {
  const color = STATUS_COLORS[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: color, boxShadow: status === "up" ? `0 0 6px ${color}` : undefined }}
            />
            <span className="text-xs text-slate-500">{service}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{service}: {status}{latencyMs !== null ? ` (${latencyMs}ms)` : ""}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

- [ ] **Step 8: Create TopBar component**

Write `src/components/layout/top-bar.tsx`:

```tsx
"use client";

import { HealthDot } from "./health-dot";
import type { HealthStatus } from "@/types";

interface TopBarProps {
  services: HealthStatus[];
}

export function TopBar({ services }: TopBarProps) {
  return (
    <header className="fixed left-64 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 backdrop-blur-sm">
      <h2 className="text-sm font-medium text-slate-300">System Health</h2>
      <div className="flex items-center gap-4">
        {services.map((svc) => (
          <HealthDot
            key={svc.service}
            service={svc.service}
            status={svc.status}
            latencyMs={svc.latencyMs}
          />
        ))}
      </div>
    </header>
  );
}
```

- [ ] **Step 9: Create root layout with shell**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agent Kitchen",
  description: "Knowledge Restaurant — AI Agent Observability Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-100`}>
        <Providers>
          <Sidebar />
          <main className="ml-64 mt-14 min-h-screen p-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 10: Create React Query provider**

Write `src/app/providers.tsx`:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

- [ ] **Step 11: Create placeholder home page**

Replace `src/app/page.tsx`:

```tsx
export default function KitchenFloor() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-amber-500">The Kitchen Floor</h1>
      <p className="text-slate-400 mt-2">Agent overview coming soon...</p>
    </div>
  );
}
```

- [ ] **Step 12: Setup Vitest config**

Write `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Write `src/test/setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 13: Verify app runs**

```bash
cd /Users/lcalderon/github/agent-kitchen
npm run dev &
sleep 3
curl -s http://localhost:3000 | head -20
kill %1
```

Expected: HTML response with "Agent Kitchen" in the page.

- [ ] **Step 14: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen
git add -A
git commit -m "feat: scaffold Next.js app with sidebar, top bar, and shell layout"
```

---

### Task 2: API Routes & React Query Hooks

**Files:**
- Create: `src/app/api/agents/route.ts`
- Create: `src/app/api/tokens/route.ts`
- Create: `src/app/api/memory/route.ts`
- Create: `src/app/api/knowledge/route.ts`
- Create: `src/app/api/health/route.ts`
- Create: `src/lib/api-client.ts`
- Create: `src/lib/parsers.ts`

- [ ] **Step 1: Create filesystem parsers**

Write `src/lib/parsers.ts`:

```typescript
import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import { execFileSync } from "child_process";
import type { Agent, AgentStatus, AgentPlatform, MemoryEntry } from "@/types";

function detectPlatform(agentName: string): AgentPlatform {
  const name = agentName.toLowerCase();
  if (name.includes("qwen")) return "qwen";
  if (name.includes("gemini")) return "gemini";
  if (name.includes("codex")) return "codex";
  if (name.includes("opencode") || name.includes("hermes")) return "opencode";
  return "claude";
}

function detectStatus(heartbeatContent: string | null, lastModified: Date | null): AgentStatus {
  if (!lastModified) return "dormant";
  const minutesAgo = (Date.now() - lastModified.getTime()) / 60000;
  if (heartbeatContent?.toLowerCase().includes("error") || heartbeatContent?.toLowerCase().includes("blocked")) return "error";
  if (minutesAgo < 5) return "active";
  if (minutesAgo < 1440) return "idle";
  return "dormant";
}

export async function parseAgents(configsPath: string): Promise<Agent[]> {
  const agents: Agent[] = [];
  let entries: string[];
  try {
    entries = await readdir(configsPath);
  } catch {
    return agents;
  }

  for (const entry of entries) {
    const agentDir = path.join(configsPath, entry);
    const dirStat = await stat(agentDir).catch(() => null);
    if (!dirStat?.isDirectory()) continue;

    let heartbeatContent: string | null = null;
    let heartbeatMtime: Date | null = null;
    try {
      const hbPath = path.join(agentDir, "HEARTBEAT.md");
      heartbeatContent = await readFile(hbPath, "utf-8");
      heartbeatMtime = (await stat(hbPath)).mtime;
    } catch { /* no heartbeat file */ }

    let currentTask: string | null = null;
    try {
      const statePath = path.join(agentDir, "HEARTBEAT_STATE.md");
      const stateContent = await readFile(statePath, "utf-8");
      const firstLine = stateContent.split("\n").find((l) => l.trim().length > 0);
      currentTask = firstLine?.replace(/^#+\s*/, "").trim() || null;
    } catch { /* no state file */ }

    let lessonsCount = 0;
    try {
      const lessons = await readFile(path.join(agentDir, "LESSONS.md"), "utf-8");
      lessonsCount = (lessons.match(/^-\s/gm) || []).length;
    } catch { /* no lessons */ }

    let todayMemoryCount = 0;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const memDir = path.join(agentDir, "memory");
      const memFiles = await readdir(memDir);
      todayMemoryCount = memFiles.filter((f) => f.includes(today)).length;
    } catch { /* no memory dir */ }

    const role = extractRole(entry);

    agents.push({
      id: entry,
      name: entry.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      role,
      platform: detectPlatform(entry),
      status: detectStatus(heartbeatContent, heartbeatMtime),
      lastHeartbeat: heartbeatMtime?.toISOString() || null,
      currentTask,
      lessonsCount,
      todayMemoryCount,
    });
  }

  return agents.sort((a, b) => {
    const order: Record<AgentStatus, number> = { active: 0, error: 1, idle: 2, dormant: 3 };
    return order[a.status] - order[b.status];
  });
}

function extractRole(dirName: string): string {
  const roles: Record<string, string> = {
    ceo: "Head Chef",
    cto: "Kitchen Architect",
    cmo: "Front of House",
    "chief-of-staff": "Sous Chef",
    "chief-product-architect": "Menu Designer",
    "founding-engineer": "Line Cook",
    "growth-strategist": "Reservations",
    "content-creator": "Pastry Chef",
    "graphic-designer": "Plating Artist",
    "seo-specialist": "Window Display",
    "social-media-manager": "Town Crier",
    "marketing-qa": "Health Inspector",
    "claude-sonnet-engineer": "Prep Cook",
    "gemini-senior-engineer": "Guest Chef",
    "qwen-engineer": "Commis Chef",
  };
  return roles[dirName] || "Kitchen Staff";
}

export function parseTokenStats(): Record<string, unknown> | null {
  try {
    const output = execFileSync("rtk", ["gain"], { encoding: "utf-8", timeout: 5000 });
    return parseRtkOutput(output);
  } catch {
    return null;
  }
}

function parseRtkOutput(output: string): Record<string, unknown> {
  const lines = output.split("\n");
  const stats: Record<string, unknown> = { raw: output, commandBreakdown: [] };

  for (const line of lines) {
    if (line.includes("Total commands:")) {
      const match = line.match(/([\d,]+)/);
      if (match) stats.totalCommands = parseInt(match[1].replace(/,/g, ""));
    }
    if (line.includes("Input tokens:")) {
      const match = line.match(/([\d,.]+[MKB]?)/);
      if (match) stats.totalInput = parseTokenCount(match[1]);
    }
    if (line.includes("Output tokens:")) {
      const match = line.match(/([\d,.]+[MKB]?)/);
      if (match) stats.totalOutput = parseTokenCount(match[1]);
    }
    if (line.includes("Tokens saved:")) {
      const match = line.match(/([\d,.]+[MKB]?)/);
      if (match) stats.tokensSaved = parseTokenCount(match[1]);
      const pctMatch = line.match(/([\d.]+)%/);
      if (pctMatch) stats.savingsPercent = parseFloat(pctMatch[1]);
    }
    if (line.includes("Avg execution:") || line.includes("avg:")) {
      const match = line.match(/([\d.]+)s/);
      if (match) stats.avgExecutionTime = parseFloat(match[1]);
    }
  }

  return stats;
}

function parseTokenCount(str: string): number {
  const num = parseFloat(str.replace(/,/g, ""));
  if (str.endsWith("M")) return num * 1_000_000;
  if (str.endsWith("K")) return num * 1_000;
  if (str.endsWith("B")) return num * 1_000_000_000;
  return num;
}

export async function parseClaudeMemory(claudeProjectsPath: string): Promise<MemoryEntry[]> {
  const entries: MemoryEntry[] = [];
  let projects: string[];
  try {
    projects = await readdir(claudeProjectsPath);
  } catch {
    return entries;
  }

  for (const project of projects) {
    const memDir = path.join(claudeProjectsPath, project, "memory");
    let files: string[];
    try {
      files = await readdir(memDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".md") || file === "MEMORY.md") continue;
      try {
        const content = await readFile(path.join(memDir, file), "utf-8");
        const typeMatch = content.match(/type:\s*(user|feedback|project|reference)/);
        entries.push({
          id: `${project}/${file}`,
          content: content.replace(/---[\s\S]*?---/, "").trim(),
          agent: "claude",
          date: (await stat(path.join(memDir, file))).mtime.toISOString(),
          type: (typeMatch?.[1] as MemoryEntry["type"]) || "project",
          source: path.join(memDir, file),
        });
      } catch { /* skip unreadable */ }
    }
  }

  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
```

- [ ] **Step 2: Create agents API route**

Write `src/app/api/agents/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { parseAgents } from "@/lib/parsers";
import { AGENT_CONFIGS_PATH } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const agents = await parseAgents(AGENT_CONFIGS_PATH);
  return NextResponse.json({ agents, timestamp: new Date().toISOString() });
}
```

- [ ] **Step 3: Create tokens API route**

Write `src/app/api/tokens/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { parseTokenStats } from "@/lib/parsers";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = parseTokenStats();
  if (!stats) {
    return NextResponse.json({ error: "RTK not available", stats: null }, { status: 503 });
  }
  return NextResponse.json({ stats, timestamp: new Date().toISOString() });
}
```

- [ ] **Step 4: Create memory API route**

Write `src/app/api/memory/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { parseClaudeMemory } from "@/lib/parsers";
import { MEM0_URL, CLAUDE_MEMORY_PATH } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") || "all";
  const query = searchParams.get("q") || "";

  const result: Record<string, unknown> = {};

  if (source === "all" || source === "mem0") {
    try {
      const res = await fetch(`${MEM0_URL}/memory/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query || "recent", user_id: "luis", limit: 50 }),
        signal: AbortSignal.timeout(3000),
      });
      result.mem0 = await res.json();
    } catch {
      result.mem0 = { error: "mem0 unavailable" };
    }
  }

  if (source === "all" || source === "claude") {
    result.claude = await parseClaudeMemory(CLAUDE_MEMORY_PATH);
  }

  return NextResponse.json({ ...result, timestamp: new Date().toISOString() });
}
```

- [ ] **Step 5: Create knowledge API route**

Write `src/app/api/knowledge/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";
import type { KnowledgeCollection } from "@/types";

export const dynamic = "force-dynamic";

const COLLECTIONS: { name: string; category: KnowledgeCollection["category"] }[] = [
  { name: "paperclip", category: "product" },
  { name: "agent-configs", category: "agents" },
  { name: "shared", category: "business" },
  { name: "oms", category: "product" },
  { name: "shopifybot", category: "product" },
  { name: "memory", category: "agents" },
  { name: "meet-recordings", category: "business" },
  { name: "alex-docs", category: "other" },
  { name: "turnedyellow-admin", category: "marketing" },
  { name: "marketing-context", category: "marketing" },
  { name: "brands", category: "marketing" },
  { name: "marketing-domains", category: "marketing" },
  { name: "sketchpop-docs", category: "product" },
  { name: "business", category: "business" },
  { name: "abtesting", category: "marketing" },
];

const KNOWLEDGE_BASE = process.env.KNOWLEDGE_BASE_PATH || `${process.env.HOME}/github/knowledge`;

export async function GET() {
  const collections: KnowledgeCollection[] = [];

  for (const col of COLLECTIONS) {
    const colPath = path.join(KNOWLEDGE_BASE, col.name);
    try {
      const files = await readdir(colPath, { recursive: true });
      const mdFiles = (files as string[]).filter((f) => f.endsWith(".md"));
      let lastUpdated: Date | null = null;
      const sample = mdFiles.slice(0, 5);
      for (const f of sample) {
        const fStat = await stat(path.join(colPath, f)).catch(() => null);
        if (fStat && (!lastUpdated || fStat.mtime > lastUpdated)) {
          lastUpdated = fStat.mtime;
        }
      }
      collections.push({
        name: col.name,
        docCount: mdFiles.length,
        category: col.category,
        lastUpdated: lastUpdated?.toISOString() || null,
      });
    } catch {
      collections.push({ name: col.name, docCount: 0, category: col.category, lastUpdated: null });
    }
  }

  const totalDocs = collections.reduce((sum, c) => sum + c.docCount, 0);

  return NextResponse.json({
    collections: collections.sort((a, b) => b.docCount - a.docCount),
    totalDocs,
    totalCollections: collections.length,
    timestamp: new Date().toISOString(),
  });
}
```

- [ ] **Step 6: Create health API route**

Write `src/app/api/health/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { stat as fsStat } from "fs/promises";
import { MEM0_URL } from "@/lib/constants";
import type { HealthStatus } from "@/types";

export const dynamic = "force-dynamic";

async function checkService(name: string, checkFn: () => Promise<void>): Promise<HealthStatus> {
  const start = Date.now();
  try {
    await checkFn();
    return { service: name, status: "up", latencyMs: Date.now() - start, lastCheck: new Date().toISOString() };
  } catch {
    return { service: name, status: "down", latencyMs: null, lastCheck: new Date().toISOString() };
  }
}

export async function GET() {
  const services = await Promise.all([
    checkService("RTK", async () => {
      execFileSync("rtk", ["--version"], { timeout: 2000 });
    }),
    checkService("mem0", async () => {
      await fetch(`${MEM0_URL}/health`, { signal: AbortSignal.timeout(2000) });
    }),
    checkService("QMD", async () => {
      execFileSync("which", ["qmd"], { timeout: 2000 });
    }),
    checkService("Agents", async () => {
      const agentsPath = `${process.env.HOME}/github/knowledge/agent-configs`;
      await fsStat(agentsPath);
    }),
  ]);

  return NextResponse.json({ services, timestamp: new Date().toISOString() });
}
```

- [ ] **Step 7: Create React Query hooks**

Write `src/lib/api-client.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { POLL_INTERVALS } from "./constants";
import type { Agent, HealthStatus, KnowledgeCollection, MemoryEntry } from "@/types";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => fetchJSON<{ agents: Agent[]; timestamp: string }>("/api/agents"),
    refetchInterval: POLL_INTERVALS.agents,
  });
}

export function useTokenStats() {
  return useQuery({
    queryKey: ["tokens"],
    queryFn: () => fetchJSON<{ stats: Record<string, unknown>; timestamp: string }>("/api/tokens"),
    refetchInterval: POLL_INTERVALS.tokens,
  });
}

export function useMemory(source?: string, query?: string) {
  const params = new URLSearchParams();
  if (source) params.set("source", source);
  if (query) params.set("q", query);
  return useQuery({
    queryKey: ["memory", source, query],
    queryFn: () => fetchJSON<{ claude?: MemoryEntry[]; mem0?: unknown; timestamp: string }>(`/api/memory?${params}`),
    refetchInterval: POLL_INTERVALS.memory,
  });
}

export function useKnowledge() {
  return useQuery({
    queryKey: ["knowledge"],
    queryFn: () =>
      fetchJSON<{ collections: KnowledgeCollection[]; totalDocs: number; totalCollections: number; timestamp: string }>(
        "/api/knowledge"
      ),
    refetchInterval: POLL_INTERVALS.knowledge,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => fetchJSON<{ services: HealthStatus[]; timestamp: string }>("/api/health"),
    refetchInterval: POLL_INTERVALS.health,
  });
}
```

- [ ] **Step 8: Verify API routes work**

```bash
cd /Users/lcalderon/github/agent-kitchen
npm run dev &
sleep 4
curl -s http://localhost:3000/api/health | python3 -m json.tool | head -20
curl -s http://localhost:3000/api/agents | python3 -m json.tool | head -20
kill %1
```

Expected: JSON responses with service health and agent data.

- [ ] **Step 9: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen
git add -A
git commit -m "feat: add API routes and React Query hooks for all data sources"
```

---

## Wave 2: Core Views (Tasks 3-5) — Depend on Wave 1, independent of each other

### Task 3: Kitchen Floor View (Home Page)

**Files:**
- Create: `src/components/kitchen/agent-card.tsx`
- Create: `src/components/kitchen/agent-grid.tsx`
- Create: `src/components/kitchen/agent-drawer.tsx`
- Create: `src/components/kitchen/summary-bar.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create SummaryBar component**

Write `src/components/kitchen/summary-bar.tsx`:

```tsx
import { Card } from "@/components/ui/card";

interface SummaryBarProps {
  total: number;
  active: number;
  tasks: number;
  errors: number;
}

export function SummaryBar({ total, active, tasks, errors }: SummaryBarProps) {
  const stats = [
    { label: "Total Chefs", value: total, color: "text-slate-100" },
    { label: "On Shift", value: active, color: "text-emerald-500" },
    { label: "Orders Active", value: tasks, color: "text-amber-500" },
    { label: "Incidents", value: errors, color: "text-rose-500" },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((s) => (
        <Card key={s.label} className="border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">{s.label}</p>
          <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create AgentCard component**

Write `src/components/kitchen/agent-card.tsx`:

```tsx
"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS, PLATFORM_LABELS } from "@/lib/constants";
import type { Agent } from "@/types";

interface AgentCardProps {
  agent: Agent;
  onClick: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const ringColor = STATUS_COLORS[agent.status];
  const timeAgo = agent.lastHeartbeat ? formatTimeAgo(new Date(agent.lastHeartbeat)) : "Never";

  return (
    <Card
      className="group cursor-pointer border-slate-800 bg-slate-900/50 p-4 transition-all hover:border-amber-500/30 hover:bg-slate-900"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
            style={{
              border: `2px solid ${ringColor}`,
              boxShadow: agent.status === "active" ? `0 0 12px ${ringColor}40` : undefined,
            }}
          >
            {"\u{1F468}\u200D\u{1F373}"}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">{agent.name}</p>
            <p className="text-xs text-amber-500/80">{agent.role}</p>
          </div>
        </div>
        <Badge variant="outline" className="border-slate-700 text-xs text-slate-400">
          {PLATFORM_LABELS[agent.platform] || agent.platform}
        </Badge>
      </div>

      {agent.currentTask && (
        <p className="mt-3 truncate text-xs text-slate-400">
          <span className="text-slate-500">Task:</span> {agent.currentTask}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>Heartbeat: {timeAgo}</span>
        <div className="flex gap-2">
          {agent.lessonsCount > 0 && <span>{"\u{1F4DD}"} {agent.lessonsCount}</span>}
          {agent.todayMemoryCount > 0 && <span>{"\u{1F9E0}"} {agent.todayMemoryCount}</span>}
        </div>
      </div>
    </Card>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
```

- [ ] **Step 3: Create AgentDrawer component**

Write `src/components/kitchen/agent-drawer.tsx`:

```tsx
"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { STATUS_COLORS, PLATFORM_LABELS } from "@/lib/constants";
import type { Agent } from "@/types";

interface AgentDrawerProps {
  agent: Agent | null;
  open: boolean;
  onClose: () => void;
}

export function AgentDrawer({ agent, open, onClose }: AgentDrawerProps) {
  if (!agent) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="border-slate-800 bg-slate-950 w-[400px]">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full text-xl"
              style={{ border: `2px solid ${STATUS_COLORS[agent.status]}` }}
            >
              {"\u{1F468}\u200D\u{1F373}"}
            </div>
            <div>
              <SheetTitle className="text-amber-500">{agent.name}</SheetTitle>
              <p className="text-sm text-slate-400">{agent.role}</p>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="flex gap-2">
            <Badge variant="outline" className="border-slate-700 text-slate-400">
              {PLATFORM_LABELS[agent.platform]}
            </Badge>
            <Badge
              variant="outline"
              style={{ borderColor: STATUS_COLORS[agent.status], color: STATUS_COLORS[agent.status] }}
            >
              {agent.status}
            </Badge>
          </div>

          <Separator className="bg-slate-800" />

          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Current Task</p>
            <p className="text-sm text-slate-300">{agent.currentTask || "No active task"}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Last Heartbeat</p>
            <p className="text-sm text-slate-300">
              {agent.lastHeartbeat ? new Date(agent.lastHeartbeat).toLocaleString() : "Never"}
            </p>
          </div>

          <Separator className="bg-slate-800" />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">Lessons Learned</p>
              <p className="text-lg font-bold text-amber-500">{agent.lessonsCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Today's Memories</p>
              <p className="text-lg font-bold text-sky-500">{agent.todayMemoryCount}</p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Create AgentGrid component**

Write `src/components/kitchen/agent-grid.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AgentCard } from "./agent-card";
import { AgentDrawer } from "./agent-drawer";
import type { Agent } from "@/types";

interface AgentGridProps {
  agents: Agent[];
}

export function AgentGrid({ agents }: AgentGridProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} onClick={() => setSelectedAgent(agent)} />
        ))}
      </div>
      <AgentDrawer agent={selectedAgent} open={!!selectedAgent} onClose={() => setSelectedAgent(null)} />
    </>
  );
}
```

- [ ] **Step 5: Wire up Kitchen Floor page**

Replace `src/app/page.tsx`:

```tsx
"use client";

import { useAgents } from "@/lib/api-client";
import { SummaryBar } from "@/components/kitchen/summary-bar";
import { AgentGrid } from "@/components/kitchen/agent-grid";

export default function KitchenFloor() {
  const { data, isLoading } = useAgents();
  const agents = data?.agents || [];
  const active = agents.filter((a) => a.status === "active").length;
  const errors = agents.filter((a) => a.status === "error").length;
  const tasks = agents.filter((a) => a.currentTask).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Kitchen Floor</h1>
        <p className="text-sm text-slate-400">Real-time agent status board</p>
      </div>

      <SummaryBar total={agents.length} active={active} tasks={tasks} errors={errors} />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <AgentGrid agents={agents} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen
git add -A
git commit -m "feat: add Kitchen Floor view with agent cards, grid, and detail drawer"
```

---

### Task 4: The Ledger View

**Files:**
- Create: `src/components/ledger/kpi-card.tsx`
- Create: `src/components/ledger/savings-chart.tsx`
- Create: `src/components/ledger/model-mix-chart.tsx`
- Create: `src/components/ledger/cost-calculator.tsx`
- Create: `src/app/ledger/page.tsx`

- [ ] **Step 1: Create KPICard component**

Write `src/components/ledger/kpi-card.tsx`:

```tsx
import { Card } from "@/components/ui/card";

interface KPICardProps {
  label: string;
  value: string;
  subtitle?: string;
  color?: string;
}

export function KPICard({ label, value, subtitle, color = "text-slate-100" }: KPICardProps) {
  return (
    <Card className="border-slate-800 bg-slate-900/50 p-5">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </Card>
  );
}
```

- [ ] **Step 2: Create SavingsChart component**

Write `src/components/ledger/savings-chart.tsx`:

```tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { COLORS } from "@/lib/constants";

interface SavingsChartProps {
  data: { command: string; tokensUsed: number; tokensSaved: number }[];
}

export function SavingsChart({ data }: SavingsChartProps) {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 60, right: 20, top: 10, bottom: 10 }}>
          <XAxis type="number" stroke="#475569" tick={{ fill: "#64748b", fontSize: 11 }} />
          <YAxis type="category" dataKey="command" stroke="#475569" tick={{ fill: "#94a3b8", fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
            labelStyle={{ color: "#e2e8f0" }}
          />
          <Bar dataKey="tokensUsed" stackId="a" fill={COLORS.info} name="Tokens Used" />
          <Bar dataKey="tokensSaved" stackId="a" fill={COLORS.success} name="Tokens Saved" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Create ModelMixChart component**

Write `src/components/ledger/model-mix-chart.tsx`:

```tsx
"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const MODEL_COLORS = ["#f59e0b", "#0ea5e9", "#10b981", "#8b5cf6"];

interface ModelMixChartProps {
  data: { name: string; value: number }[];
}

export function ModelMixChart({ data }: ModelMixChartProps) {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
            labelStyle={{ color: "#e2e8f0" }}
          />
          <Legend
            formatter={(value) => <span style={{ color: "#94a3b8", fontSize: 12 }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Create CostCalculator component**

Write `src/components/ledger/cost-calculator.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface CostCalculatorProps {
  totalInput: number;
  totalOutput: number;
  tokensSaved: number;
}

export function CostCalculator({ totalInput, totalOutput, tokensSaved }: CostCalculatorProps) {
  const [inputPrice, setInputPrice] = useState(3);
  const [outputPrice, setOutputPrice] = useState(15);

  const totalCost = (totalInput / 1_000_000) * inputPrice + (totalOutput / 1_000_000) * outputPrice;
  const savedCost = (tokensSaved / 1_000_000) * ((inputPrice + outputPrice) / 2);

  return (
    <Card className="border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs font-medium text-slate-500 mb-3">Cost Calculator</p>
      <div className="flex gap-4 mb-3">
        <div>
          <label className="text-xs text-slate-500">Input $/1M tokens</label>
          <Input
            type="number"
            value={inputPrice}
            onChange={(e) => setInputPrice(Number(e.target.value))}
            className="mt-1 h-8 w-24 border-slate-700 bg-slate-800 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Output $/1M tokens</label>
          <Input
            type="number"
            value={outputPrice}
            onChange={(e) => setOutputPrice(Number(e.target.value))}
            className="mt-1 h-8 w-24 border-slate-700 bg-slate-800 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-6">
        <div>
          <p className="text-xs text-slate-500">Estimated Spend</p>
          <p className="text-lg font-bold text-rose-400">${totalCost.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">RTK Saved</p>
          <p className="text-lg font-bold text-emerald-500">${savedCost.toFixed(2)}</p>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Create Ledger page**

Write `src/app/ledger/page.tsx`:

```tsx
"use client";

import { useTokenStats } from "@/lib/api-client";
import { KPICard } from "@/components/ledger/kpi-card";
import { SavingsChart } from "@/components/ledger/savings-chart";
import { ModelMixChart } from "@/components/ledger/model-mix-chart";
import { CostCalculator } from "@/components/ledger/cost-calculator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function LedgerPage() {
  const { data, isLoading } = useTokenStats();
  const stats = data?.stats as Record<string, number> | null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const totalInput = stats?.totalInput || 0;
  const totalOutput = stats?.totalOutput || 0;
  const tokensSaved = stats?.tokensSaved || 0;
  const savingsPercent = stats?.savingsPercent || 0;
  const totalCommands = stats?.totalCommands || 0;
  const avgExec = stats?.avgExecutionTime || 0;

  const sampleBreakdown = [
    { command: "find", tokensUsed: 5000, tokensSaved: 45000 },
    { command: "grep", tokensUsed: 8000, tokensSaved: 32000 },
    { command: "git", tokensUsed: 3000, tokensSaved: 12000 },
    { command: "curl", tokensUsed: 2000, tokensSaved: 8000 },
    { command: "ls", tokensUsed: 1000, tokensSaved: 15000 },
  ];

  const modelMixData = [
    { name: "Opus", value: 40 },
    { name: "Sonnet", value: 35 },
    { name: "Haiku", value: 20 },
    { name: "Other", value: 5 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Ledger</h1>
        <p className="text-sm text-slate-400">Token economics command center</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KPICard
          label="Tokens Processed"
          value={`${formatNum(totalInput)} / ${formatNum(totalOutput)}`}
          subtitle="input / output"
        />
        <KPICard
          label="Tokens Saved"
          value={formatNum(tokensSaved)}
          subtitle={`${savingsPercent.toFixed(1)}% efficiency`}
          color="text-emerald-500"
        />
        <KPICard label="Total Commands" value={formatNum(totalCommands)} color="text-sky-500" />
        <KPICard label="Avg Execution" value={`${avgExec.toFixed(1)}s`} color="text-amber-500" />
      </div>

      <Tabs defaultValue="savings" className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800">
          <TabsTrigger value="savings" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
            Savings Breakdown
          </TabsTrigger>
          <TabsTrigger value="model" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
            Model Mix
          </TabsTrigger>
        </TabsList>
        <TabsContent value="savings" className="mt-4">
          <SavingsChart data={sampleBreakdown} />
        </TabsContent>
        <TabsContent value="model" className="mt-4">
          <ModelMixChart data={modelMixData} />
        </TabsContent>
      </Tabs>

      <CostCalculator totalInput={totalInput} totalOutput={totalOutput} tokensSaved={tokensSaved} />
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen
git add -A
git commit -m "feat: add Ledger view with KPI cards, charts, and cost calculator"
```

---

### Task 5: The Library View

**Files:**
- Create: `src/components/library/collection-card.tsx`
- Create: `src/components/library/collection-treemap.tsx`
- Create: `src/components/library/health-panel.tsx`
- Create: `src/app/library/page.tsx`

- [ ] **Step 1: Create CollectionCard component**

Write `src/components/library/collection-card.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import type { KnowledgeCollection } from "@/types";

const CATEGORY_COLORS: Record<string, string> = {
  business: "#0ea5e9",
  agents: "#10b981",
  marketing: "#f59e0b",
  product: "#8b5cf6",
  other: "#64748b",
};

interface CollectionCardProps {
  collection: KnowledgeCollection;
  maxCount: number;
  onClick: () => void;
}

export function CollectionCard({ collection, maxCount, onClick }: CollectionCardProps) {
  const intensity = Math.max(0.2, collection.docCount / maxCount);
  const color = CATEGORY_COLORS[collection.category] || CATEGORY_COLORS.other;

  return (
    <Card
      className="cursor-pointer border-slate-800 bg-slate-900/50 p-3 transition-all hover:border-amber-500/30"
      onClick={onClick}
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-200">{collection.name}</p>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {collection.docCount}
        </span>
      </div>
      <div className="mt-2 h-1 w-full rounded-full bg-slate-800">
        <div className="h-1 rounded-full" style={{ width: `${intensity * 100}%`, backgroundColor: color }} />
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Create CollectionTreemap component**

Write `src/components/library/collection-treemap.tsx`:

```tsx
"use client";

import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import type { KnowledgeCollection } from "@/types";

const CATEGORY_COLORS: Record<string, string> = {
  business: "#0ea5e9",
  agents: "#10b981",
  marketing: "#f59e0b",
  product: "#8b5cf6",
  other: "#64748b",
};

interface CollectionTreemapProps {
  collections: KnowledgeCollection[];
}

export function CollectionTreemap({ collections }: CollectionTreemapProps) {
  const data = collections.map((c) => ({
    name: c.name,
    size: c.docCount,
    fill: CATEGORY_COLORS[c.category] || CATEGORY_COLORS.other,
  }));

  return (
    <div className="h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="size"
          nameKey="name"
          stroke="#1e293b"
          content={({ x, y, width, height, name, fill }) => {
            if (typeof width !== "number" || typeof height !== "number") return null;
            if (width < 40 || height < 30) return null;
            return (
              <g>
                <rect x={x} y={y} width={width} height={height} fill={fill as string} rx={4} opacity={0.8} />
                <text x={(x as number) + 8} y={(y as number) + 18} fill="#e2e8f0" fontSize={11} fontWeight={600}>
                  {name}
                </text>
              </g>
            );
          }}
        >
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
            formatter={(value: number) => [`${value} docs`, "Documents"]}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Create HealthPanel component**

Write `src/components/library/health-panel.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import type { KnowledgeCollection } from "@/types";

interface HealthPanelProps {
  collections: KnowledgeCollection[];
  totalDocs: number;
}

export function HealthPanel({ collections, totalDocs }: HealthPanelProps) {
  const staleCollections = collections.filter((c) => {
    if (!c.lastUpdated) return true;
    const daysSince = (Date.now() - new Date(c.lastUpdated).getTime()) / 86400000;
    return daysSince > 30;
  });

  const smallCollections = collections.filter((c) => c.docCount < 10 && c.docCount > 0);

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card className="border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs font-medium text-slate-500 mb-2">Coverage Gaps</p>
        {smallCollections.length === 0 ? (
          <p className="text-sm text-emerald-500">All collections healthy</p>
        ) : (
          <ul className="space-y-1">
            {smallCollections.map((c) => (
              <li key={c.name} className="text-sm text-amber-400">
                {c.name} - only {c.docCount} docs
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs font-medium text-slate-500 mb-2">Freshness Alerts</p>
        {staleCollections.length === 0 ? (
          <p className="text-sm text-emerald-500">All collections fresh</p>
        ) : (
          <ul className="space-y-1">
            {staleCollections.map((c) => (
              <li key={c.name} className="text-sm text-rose-400">
                {c.name} - {c.lastUpdated ? `stale since ${new Date(c.lastUpdated).toLocaleDateString()}` : "never updated"}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="col-span-2 border-slate-800 bg-slate-900/50 p-4">
        <div className="flex justify-between">
          <div>
            <p className="text-xs text-slate-500">Total Documents</p>
            <p className="text-2xl font-bold text-slate-100">{totalDocs.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Collections</p>
            <p className="text-2xl font-bold text-amber-500">{collections.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Avg Size</p>
            <p className="text-2xl font-bold text-sky-500">
              {collections.length > 0 ? Math.round(totalDocs / collections.length) : 0}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Create Library page**

Write `src/app/library/page.tsx`:

```tsx
"use client";

import { useKnowledge } from "@/lib/api-client";
import { CollectionCard } from "@/components/library/collection-card";
import { CollectionTreemap } from "@/components/library/collection-treemap";
import { HealthPanel } from "@/components/library/health-panel";

export default function LibraryPage() {
  const { data, isLoading } = useKnowledge();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const collections = data?.collections || [];
  const totalDocs = data?.totalDocs || 0;
  const maxCount = Math.max(...collections.map((c) => c.docCount), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Library</h1>
        <p className="text-sm text-slate-400">Knowledge base health & coverage</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {collections.slice(0, 10).map((col) => (
          <CollectionCard key={col.name} collection={col} maxCount={maxCount} onClick={() => {}} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-medium text-slate-400">Collection Treemap</h2>
          <CollectionTreemap collections={collections} />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-medium text-slate-400">Health & Coverage</h2>
          <HealthPanel collections={collections} totalDocs={totalDocs} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen
git add -A
git commit -m "feat: add Library view with collection cards, treemap, and health panel"
```

---

## Wave 3: Remaining Views (Tasks 6-7) — Depend on Wave 1

### Task 6: Notebook Wall View

**Files:**
- Create: `src/components/notebooks/memory-list.tsx`
- Create: `src/components/notebooks/calendar-heatmap.tsx`
- Create: `src/components/notebooks/content-viewer.tsx`
- Create: `src/app/notebooks/page.tsx`

- [ ] **Step 1: Create MemoryList component**

Write `src/components/notebooks/memory-list.tsx`:

```tsx
"use client";

import { Card } from "@/components/ui/card";
import type { MemoryEntry } from "@/types";

const TYPE_COLORS: Record<string, string> = {
  user: "#0ea5e9",
  feedback: "#f59e0b",
  project: "#10b981",
  reference: "#8b5cf6",
  daily: "#64748b",
};

interface MemoryListProps {
  entries: MemoryEntry[];
  onSelect: (entry: MemoryEntry) => void;
  selected: MemoryEntry | null;
}

export function MemoryList({ entries, onSelect, selected }: MemoryListProps) {
  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
      {entries.length === 0 && (
        <p className="text-sm text-slate-500 py-8 text-center">No memories found</p>
      )}
      {entries.map((entry) => (
        <Card
          key={entry.id}
          className={`cursor-pointer border-slate-800 p-3 transition-all hover:border-amber-500/30 ${
            selected?.id === entry.id ? "border-amber-500/50 bg-amber-500/5" : "bg-slate-900/50"
          }`}
          onClick={() => onSelect(entry)}
        >
          <p className="text-sm text-slate-200 truncate">
            {entry.content.slice(0, 80)}...
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-xs"
              style={{ backgroundColor: `${TYPE_COLORS[entry.type]}20`, color: TYPE_COLORS[entry.type] }}
            >
              {entry.type}
            </span>
            <span className="text-xs text-slate-500">{entry.agent}</span>
            <span className="text-xs text-slate-600">{new Date(entry.date).toLocaleDateString()}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create CalendarHeatmap component**

Write `src/components/notebooks/calendar-heatmap.tsx`:

```tsx
"use client";

import type { MemoryEntry } from "@/types";

interface CalendarHeatmapProps {
  entries: MemoryEntry[];
}

export function CalendarHeatmap({ entries }: CalendarHeatmapProps) {
  const dateCounts: Record<string, number> = {};
  for (const entry of entries) {
    const date = entry.date.slice(0, 10);
    dateCounts[date] = (dateCounts[date] || 0) + 1;
  }

  const days: { date: string; count: number }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({ date: dateStr, count: dateCounts[dateStr] || 0 });
  }

  const maxCount = Math.max(...days.map((d) => d.count), 1);

  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-2">Memory Activity (90 days)</p>
      <div className="flex flex-wrap gap-1">
        {days.map((day) => {
          const intensity = day.count / maxCount;
          const bg = day.count === 0 ? "#1e293b" : `rgba(245, 158, 11, ${Math.max(0.15, intensity)})`;
          return (
            <div
              key={day.date}
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: bg }}
              title={`${day.date}: ${day.count} entries`}
            />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ContentViewer component**

Write `src/components/notebooks/content-viewer.tsx`:

```tsx
"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { MemoryEntry } from "@/types";

interface ContentViewerProps {
  entry: MemoryEntry | null;
}

export function ContentViewer({ entry }: ContentViewerProps) {
  if (!entry) {
    return (
      <Card className="flex h-full items-center justify-center border-slate-800 bg-slate-900/50 p-8">
        <p className="text-sm text-slate-500">Select a memory to view its contents</p>
      </Card>
    );
  }

  return (
    <Card className="border-slate-800 bg-slate-900/50 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="outline" className="border-slate-700 text-slate-400">{entry.type}</Badge>
        <Badge variant="outline" className="border-slate-700 text-slate-400">{entry.agent}</Badge>
        <span className="text-xs text-slate-500">{new Date(entry.date).toLocaleString()}</span>
      </div>
      <Separator className="bg-slate-800 mb-4" />
      <pre className="whitespace-pre-wrap text-sm text-slate-300 font-mono">{entry.content}</pre>
      <Separator className="bg-slate-800 mt-4 mb-3" />
      <p className="text-xs text-slate-600 truncate">Source: {entry.source}</p>
    </Card>
  );
}
```

- [ ] **Step 4: Create Notebooks page**

Write `src/app/notebooks/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMemory } from "@/lib/api-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemoryList } from "@/components/notebooks/memory-list";
import { CalendarHeatmap } from "@/components/notebooks/calendar-heatmap";
import { ContentViewer } from "@/components/notebooks/content-viewer";
import { Card } from "@/components/ui/card";
import type { MemoryEntry } from "@/types";

export default function NotebooksPage() {
  const { data, isLoading } = useMemory("claude");
  const [selected, setSelected] = useState<MemoryEntry | null>(null);
  const entries: MemoryEntry[] = (data?.claude as MemoryEntry[]) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const typeCounts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Notebook Wall</h1>
        <p className="text-sm text-slate-400">Memory explorer across all agents</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">Total Memories</p>
          <p className="text-2xl font-bold text-slate-100">{entries.length}</p>
        </Card>
        <Card className="border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">Added Today</p>
          <p className="text-2xl font-bold text-amber-500">
            {entries.filter((e) => e.date.startsWith(new Date().toISOString().slice(0, 10))).length}
          </p>
        </Card>
        <Card className="border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">Feedback</p>
          <p className="text-2xl font-bold text-sky-500">{typeCounts.feedback || 0}</p>
        </Card>
        <Card className="border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">Projects</p>
          <p className="text-2xl font-bold text-emerald-500">{typeCounts.project || 0}</p>
        </Card>
      </div>

      <CalendarHeatmap entries={entries} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Tabs defaultValue="all">
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger value="all" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">All</TabsTrigger>
            <TabsTrigger value="feedback" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">Feedback</TabsTrigger>
            <TabsTrigger value="project" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">Project</TabsTrigger>
            <TabsTrigger value="user" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">User</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-4">
            <MemoryList entries={entries} onSelect={setSelected} selected={selected} />
          </TabsContent>
          <TabsContent value="feedback" className="mt-4">
            <MemoryList entries={entries.filter((e) => e.type === "feedback")} onSelect={setSelected} selected={selected} />
          </TabsContent>
          <TabsContent value="project" className="mt-4">
            <MemoryList entries={entries.filter((e) => e.type === "project")} onSelect={setSelected} selected={selected} />
          </TabsContent>
          <TabsContent value="user" className="mt-4">
            <MemoryList entries={entries.filter((e) => e.type === "user")} onSelect={setSelected} selected={selected} />
          </TabsContent>
        </Tabs>
        <ContentViewer entry={selected} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen
git add -A
git commit -m "feat: add Notebook Wall view with memory list, heatmap, and content viewer"
```

---

### Task 7: The Flow View (Animated)

**Files:**
- Create: `src/components/flow/flow-canvas.tsx`
- Create: `src/components/flow/flow-node.tsx`
- Create: `src/components/flow/flow-edge.tsx`
- Create: `src/components/flow/demo-mode.tsx`
- Create: `src/app/flow/page.tsx`

- [ ] **Step 1: Create FlowNode component**

Write `src/components/flow/flow-node.tsx`:

```tsx
"use client";

import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { STATUS_COLORS } from "@/lib/constants";

interface FlowNodeProps {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  x: number;
  y: number;
  status: "active" | "idle" | "error";
  stats: Record<string, string | number>;
  highlighted?: boolean;
  onClick?: () => void;
}

export function FlowNode({ label, subtitle, icon, x, y, status, stats, highlighted, onClick }: FlowNodeProps) {
  const color = STATUS_COLORS[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            style={{ cursor: "pointer" }}
            onClick={onClick}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            {(status === "active" || highlighted) && (
              <motion.circle
                cx={x + 35}
                cy={y + 35}
                r={42}
                fill="none"
                stroke={highlighted ? "#f59e0b" : color}
                strokeWidth={2}
                opacity={0.4}
                animate={{ r: [42, 48, 42], opacity: [0.4, 0.15, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
            <rect x={x} y={y} width={70} height={70} rx={16} fill="#0f172a"
              stroke={highlighted ? "#f59e0b" : color} strokeWidth={highlighted ? 2.5 : 1.5} />
            <text x={x + 35} y={y + 32} textAnchor="middle" fontSize={24}>{icon}</text>
            <text x={x + 35} y={y + 90} textAnchor="middle" fill="#e2e8f0" fontSize={11} fontWeight={600}>{label}</text>
            <text x={x + 35} y={y + 103} textAnchor="middle" fill="#64748b" fontSize={9}>{subtitle}</text>
          </motion.g>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 border-slate-700">
          <div className="space-y-1">
            <p className="font-semibold text-amber-500">{label}</p>
            {Object.entries(stats).map(([k, v]) => (
              <p key={k} className="text-xs">
                <span className="text-slate-400">{k}:</span> <span className="text-slate-200">{v}</span>
              </p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Create FlowEdge component**

Write `src/components/flow/flow-edge.tsx`:

```tsx
"use client";

import { motion } from "framer-motion";

const TYPE_COLORS: Record<string, string> = {
  request: "#f59e0b",
  knowledge: "#10b981",
  memory: "#0ea5e9",
  error: "#f43f5e",
};

interface FlowEdgeProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: "request" | "knowledge" | "memory" | "error";
  animated?: boolean;
}

export function FlowEdge({ x1, y1, x2, y2, type, animated = true }: FlowEdgeProps) {
  const color = TYPE_COLORS[type];

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.5} opacity={0.3} />
      {animated && (
        <motion.circle
          r={3}
          fill={color}
          filter={`drop-shadow(0 0 4px ${color})`}
          animate={{ cx: [x1, x2], cy: [y1, y2] }}
          transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, ease: "linear" }}
        />
      )}
    </g>
  );
}
```

- [ ] **Step 3: Create DemoMode component**

Write `src/components/flow/demo-mode.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

const DEMO_STEPS = [
  { nodeId: "agents", caption: "1. Qwen wakes up (new session)" },
  { nodeId: "notebooks", caption: "2. Reads notebook - \"Luis likes concise copy\"" },
  { nodeId: "cookbooks", caption: "3. Checks recipes - \"I need the copywriting skill!\"" },
  { nodeId: "librarian", caption: "4. Asks librarian - \"What's TurnedYellow's brand voice?\"" },
  { nodeId: "agents", caption: "5. Writes the ad using recipe + brand facts" },
  { nodeId: "notebooks", caption: "6. Learns - \"make it funnier\" -> saves to notebook" },
];

interface DemoModeProps {
  running: boolean;
  onToggle: () => void;
  onHighlight: (nodeId: string | null) => void;
}

export function DemoMode({ running, onToggle, onHighlight }: DemoModeProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!running) {
      onHighlight(null);
      setStep(0);
      return;
    }

    onHighlight(DEMO_STEPS[step].nodeId);

    const timer = setTimeout(() => {
      if (step < DEMO_STEPS.length - 1) {
        setStep(step + 1);
      } else {
        onToggle();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [running, step, onHighlight, onToggle]);

  return (
    <div className="absolute bottom-4 left-4 right-4">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className={`border-slate-700 ${running ? "bg-amber-500/10 text-amber-500 border-amber-500/30" : "text-slate-400"}`}
          onClick={onToggle}
        >
          {running ? "Stop Demo" : "Demo: Write a Facebook Ad"}
        </Button>

        <AnimatePresence mode="wait">
          {running && (
            <motion.p
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-sm text-amber-400 bg-slate-900/90 px-4 py-2 rounded-lg border border-amber-500/20"
            >
              {DEMO_STEPS[step].caption}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create FlowCanvas component**

Write `src/components/flow/flow-canvas.tsx`:

```tsx
"use client";

import { useState } from "react";
import { FlowNode } from "./flow-node";
import { FlowEdge } from "./flow-edge";
import { DemoMode } from "./demo-mode";
import type { HealthStatus } from "@/types";

interface FlowCanvasProps {
  services: HealthStatus[];
  agentCount: number;
  memoryCount: number;
  knowledgeCount: number;
  skillCount: number;
}

const NODES = [
  { id: "request", label: "Request In", subtitle: "User input", icon: "\u{1F4E5}", x: 30, y: 120 },
  { id: "gateways", label: "Gateway Doors", subtitle: "OpenClaw", icon: "\u{1F6AA}", x: 180, y: 60 },
  { id: "manager", label: "Kitchen Manager", subtitle: "Paperclip", icon: "\u{1F4DE}", x: 350, y: 120 },
  { id: "agents", label: "Chef Stations", subtitle: "Agents", icon: "\u{1F468}\u200D\u{1F373}", x: 530, y: 120 },
  { id: "output", label: "Output", subtitle: "Response", icon: "\u{1F4E4}", x: 700, y: 120 },
  { id: "tunnels", label: "Phone Lines", subtitle: "CF Tunnels", icon: "\u{1F4E1}", x: 180, y: 250 },
  { id: "taskboard", label: "Task Board", subtitle: "Orchestration", icon: "\u{1F4CB}", x: 350, y: 250 },
  { id: "cookbooks", label: "Cookbooks", subtitle: "skillshare", icon: "\u{1F4DA}", x: 480, y: 280 },
  { id: "notebooks", label: "Notebooks", subtitle: "mem0", icon: "\u{1F9E0}", x: 580, y: 280 },
  { id: "librarian", label: "Librarian", subtitle: "QMD", icon: "\u{1F50D}", x: 680, y: 280 },
];

const EDGES: { from: string; to: string; type: "request" | "knowledge" | "memory" | "error" }[] = [
  { from: "request", to: "gateways", type: "request" },
  { from: "gateways", to: "manager", type: "request" },
  { from: "manager", to: "agents", type: "request" },
  { from: "agents", to: "output", type: "request" },
  { from: "gateways", to: "tunnels", type: "request" },
  { from: "manager", to: "taskboard", type: "request" },
  { from: "agents", to: "cookbooks", type: "knowledge" },
  { from: "agents", to: "notebooks", type: "memory" },
  { from: "agents", to: "librarian", type: "knowledge" },
];

export function FlowCanvas({ services, agentCount, memoryCount, knowledgeCount, skillCount }: FlowCanvasProps) {
  const [demoRunning, setDemoRunning] = useState(false);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);

  function getNodeStatus(nodeId: string): "active" | "idle" | "error" {
    const svcMap: Record<string, string> = { gateways: "Agents", manager: "Agents", notebooks: "mem0", librarian: "QMD" };
    const svcName = svcMap[nodeId];
    if (!svcName) return "idle";
    const svc = services.find((s) => s.service === svcName);
    if (svc?.status === "up") return "active";
    if (svc?.status === "down") return "error";
    return "idle";
  }

  function getNodeStats(nodeId: string): Record<string, string | number> {
    switch (nodeId) {
      case "agents": return { "Total Chefs": agentCount };
      case "notebooks": return { "Entries": memoryCount };
      case "librarian": return { "Collections": 15, "Documents": knowledgeCount };
      case "cookbooks": return { "Skills": skillCount };
      case "gateways": return { "Alba": 18793, "Gwen": 18792, "Sophia": 18889 };
      default: return {};
    }
  }

  return (
    <div className="relative rounded-xl border border-slate-800 bg-slate-900/30 p-4">
      <svg width="100%" viewBox="0 0 800 370" className="overflow-visible">
        {EDGES.map((edge) => {
          const fromNode = NODES.find((n) => n.id === edge.from)!;
          const toNode = NODES.find((n) => n.id === edge.to)!;
          return (
            <FlowEdge
              key={`${edge.from}-${edge.to}`}
              x1={fromNode.x + 35} y1={fromNode.y + 35}
              x2={toNode.x + 35} y2={toNode.y + 35}
              type={edge.type}
            />
          );
        })}
        {NODES.map((node) => (
          <FlowNode
            key={node.id} id={node.id} label={node.label} subtitle={node.subtitle}
            icon={node.icon} x={node.x} y={node.y}
            status={getNodeStatus(node.id)}
            stats={getNodeStats(node.id)}
            highlighted={highlightedNode === node.id}
          />
        ))}
      </svg>
      <DemoMode running={demoRunning} onToggle={() => setDemoRunning(!demoRunning)} onHighlight={setHighlightedNode} />
    </div>
  );
}
```

- [ ] **Step 5: Create Flow page**

Write `src/app/flow/page.tsx`:

```tsx
"use client";

import { useHealth, useAgents, useKnowledge, useMemory } from "@/lib/api-client";
import { FlowCanvas } from "@/components/flow/flow-canvas";

export default function FlowPage() {
  const { data: healthData } = useHealth();
  const { data: agentsData } = useAgents();
  const { data: knowledgeData } = useKnowledge();
  const { data: memoryData } = useMemory("claude");

  const services = healthData?.services || [];
  const agentCount = agentsData?.agents.length || 0;
  const memoryCount = Array.isArray(memoryData?.claude) ? memoryData.claude.length : 0;
  const knowledgeCount = knowledgeData?.totalDocs || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Flow</h1>
        <p className="text-sm text-slate-400">Live system architecture - the Knowledge Restaurant in action</p>
      </div>
      <FlowCanvas
        services={services} agentCount={agentCount} memoryCount={memoryCount}
        knowledgeCount={knowledgeCount} skillCount={405}
      />
      <div className="flex gap-6 text-xs text-slate-500">
        <div className="flex items-center gap-1.5"><div className="h-2 w-6 rounded-full bg-amber-500" /> Request flow</div>
        <div className="flex items-center gap-1.5"><div className="h-2 w-6 rounded-full bg-emerald-500" /> Knowledge lookup</div>
        <div className="flex items-center gap-1.5"><div className="h-2 w-6 rounded-full bg-sky-500" /> Memory read/write</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen
git add -A
git commit -m "feat: add Flow view with animated nodes, particles, edges, and demo mode"
```

---

## Wave 4: Integration & Polish (Tasks 8-10)

### Task 8: Wire TopBar Health Into Layout

**Files:**
- Create: `src/components/layout/shell.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create Shell component**

Write `src/components/layout/shell.tsx`:

```tsx
"use client";

import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { useHealth } from "@/lib/api-client";

export function Shell({ children }: { children: React.ReactNode }) {
  const { data } = useHealth();
  const services = data?.services || [];

  return (
    <>
      <Sidebar />
      <TopBar services={services} />
      <main className="ml-64 mt-14 min-h-screen p-6">{children}</main>
    </>
  );
}
```

- [ ] **Step 2: Update root layout to use Shell**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/layout/shell";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agent Kitchen",
  description: "Knowledge Restaurant — AI Agent Observability Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-100`}>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen
git add -A
git commit -m "feat: wire TopBar health indicators into app shell"
```

---

### Task 9: Build Verification & Smoke Test

**Files:**
- Create: `src/test/smoke.test.tsx`

- [ ] **Step 1: Write smoke tests**

Write `src/test/smoke.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SummaryBar } from "@/components/kitchen/summary-bar";
import { KPICard } from "@/components/ledger/kpi-card";
import { HealthDot } from "@/components/layout/health-dot";

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("Kitchen components", () => {
  it("SummaryBar renders stats", () => {
    render(<SummaryBar total={51} active={4} tasks={12} errors={1} />);
    expect(screen.getByText("51")).toBeDefined();
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getByText("Total Chefs")).toBeDefined();
  });
});

describe("Ledger components", () => {
  it("KPICard renders label and value", () => {
    render(<KPICard label="Test Metric" value="42" subtitle="units" />);
    expect(screen.getByText("Test Metric")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("units")).toBeDefined();
  });
});

describe("Layout components", () => {
  it("HealthDot renders service name", () => {
    render(
      <Wrapper>
        <HealthDot service="RTK" status="up" latencyMs={12} />
      </Wrapper>
    );
    expect(screen.getByText("RTK")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/lcalderon/github/agent-kitchen
npx vitest run
```

Expected: All 3 tests pass.

- [ ] **Step 3: Run build**

```bash
cd /Users/lcalderon/github/agent-kitchen
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen
git add -A
git commit -m "test: add smoke tests for Kitchen, Ledger, and Layout components"
```

---

### Task 10: GitHub Repo & README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Write `README.md`:

```markdown
# Agent Kitchen

**The Knowledge Restaurant** - A beautiful, restaurant-themed observability dashboard for AI agent infrastructure.

## Views

- **The Kitchen Floor** - Real-time agent grid with status, heartbeats, and task tracking
- **The Ledger** - Token economics: spend, savings (via RTK), cost calculator
- **The Notebook Wall** - Memory explorer: mem0 semantic search, agent daily notes, calendar heatmap
- **The Library** - Knowledge base health: collection treemap, coverage gaps, freshness alerts
- **The Flow** - Animated system architecture with live data and interactive demo mode

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000).

## Data Sources

| Service | Endpoint | What it provides |
|---------|----------|-----------------|
| Filesystem | /api/agents | Agent configs, heartbeats, memory |
| RTK | /api/tokens | Token usage and savings analytics |
| mem0 | /api/memory | Semantic memory entries |
| QMD / Files | /api/knowledge | Knowledge base collections and stats |
| All | /api/health | Service health status |

## Tech Stack

Next.js 15 + Tailwind CSS + shadcn/ui + Recharts + Framer Motion + TanStack Query

## Testing

\`\`\`bash
npm test
\`\`\`

## License

MIT
```

- [ ] **Step 2: Create GitHub repo and push**

```bash
cd /Users/lcalderon/github/agent-kitchen
gh repo create lac5q/agent-kitchen --public --source=. --description "The Knowledge Restaurant - AI agent observability dashboard" --push
```

- [ ] **Step 3: Verify on GitHub**

```bash
gh repo view lac5q/agent-kitchen --web
```

---

## Task Dependency Map

```
Wave 1 (parallel):  Task 1 ----+---- Task 2
                                |
Wave 2 (parallel):  Task 3 ----+---- Task 4 ----+---- Task 5
                                |                |
Wave 3 (parallel):  Task 6 ----+---- Task 7     |
                                                 |
Wave 4 (sequential): Task 8 --> Task 9 --> Task 10
```

Tasks within the same wave can be executed in parallel (by separate subagents in worktrees). Tasks in later waves depend on Wave 1 being complete.

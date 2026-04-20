# Polyglot Agent Dispatch — Plan 02: DispatchPanel UI + Agent Card Endpoints

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/dispatch` page with A2A Agent Card API endpoints, a DispatchPanel with live delegation list + lineage drawer, and an AgentCardsPanel so Luis can validate A2A cards in the browser.

**Architecture:** Two new API routes (`/api/agents/[id]/card`, `/api/agents/cards`) serve A2A-spec agent cards derived from `agents.config.json`. A new `/dispatch` page mounts `DispatchPanel` (dispatch form + live delegation list) and `AgentCardsPanel` (card inspection). `LineageDrawer` is a Sheet slide-in triggered by clicking a delegation row, showing the full action timeline for that task.

**Tech Stack:** Next.js 16 App Router, React Query (`@tanstack/react-query`), Vitest + RTL, Tailwind CSS, shadcn Sheet component, existing `src/lib/agent-registry.ts`, `src/app/api/hive/route.ts`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/lib/dispatch/derive-skills.ts` | `deriveSkills(role)` → `Skill[]` heuristic |
| Create | `src/lib/dispatch/build-agent-card.ts` | `buildAgentCard(agent)` → A2A card object |
| Create | `src/lib/dispatch/__tests__/derive-skills.test.ts` | Unit tests for deriveSkills |
| Create | `src/app/api/agents/[id]/card/route.ts` | GET single agent card |
| Create | `src/app/api/agents/cards/route.ts` | GET all agent cards |
| Create | `src/app/api/agents/__tests__/card.test.ts` | Node tests for card routes |
| Modify | `src/types/index.ts` | Add `Skill` interface + `skills?` to `RemoteAgentConfig` |
| Modify | `src/lib/api-client.ts` | Add `useDelegations`, `useLineage`, `useAgentCards` hooks |
| Create | `src/components/dispatch/lineage-drawer.tsx` | Sheet-based timeline slide-in |
| Create | `src/components/dispatch/dispatch-panel.tsx` | Dispatch form + delegation list |
| Create | `src/components/dispatch/agent-cards-panel.tsx` | Agent card grid for inspection |
| Create | `src/components/dispatch/__tests__/lineage-drawer.test.tsx` | RTL tests |
| Create | `src/components/dispatch/__tests__/dispatch-panel.test.tsx` | RTL tests |
| Create | `src/app/dispatch/page.tsx` | `/dispatch` page |
| Modify | `src/components/layout/sidebar.tsx` | Add "The Dispatch" nav item |

---

## Task 1: Types + `deriveSkills`

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/dispatch/derive-skills.ts`
- Create: `src/lib/dispatch/__tests__/derive-skills.test.ts`

- [ ] **Step 1: Add `Skill` type and extend `RemoteAgentConfig` in `src/types/index.ts`**

  Open `src/types/index.ts`. After the `RemoteAgentConfig` interface, add:

  ```typescript
  export interface AgentCardSkill {
    id: string;
    name: string;
    description: string;
    tags: string[];
    inputModes: ["text"];
    outputModes: ["text"];
  }
  ```

  Then add `skills?: AgentCardSkill[];` as the last field of `RemoteAgentConfig`:

  ```typescript
  export interface RemoteAgentConfig {
    id: string;
    name: string;
    role: string;
    platform: AgentPlatform;
    location: AgentLocation;
    host: string;
    port: number;
    healthEndpoint: string;
    tunnelUrl?: string;
    skills?: AgentCardSkill[];
  }
  ```

- [ ] **Step 2: Write failing test for `deriveSkills`**

  Create `src/lib/dispatch/__tests__/derive-skills.test.ts`:

  ```typescript
  import { describe, it, expect } from "vitest";
  import { deriveSkills } from "../derive-skills";

  describe("deriveSkills", () => {
    it("returns memory skill for memory-related roles", () => {
      const skills = deriveSkills("memory-curator");
      expect(skills.some((s) => s.id === "memory-write")).toBe(true);
    });

    it("returns code skill for developer roles", () => {
      const skills = deriveSkills("senior-developer");
      expect(skills.some((s) => s.id === "code-execute")).toBe(true);
    });

    it("returns research skill for research roles", () => {
      const skills = deriveSkills("research-analyst");
      expect(skills.some((s) => s.id === "web-search")).toBe(true);
    });

    it("returns planning skill for PM roles", () => {
      const skills = deriveSkills("product-manager");
      expect(skills.some((s) => s.id === "task-planning")).toBe(true);
    });

    it("returns generic task skill for unknown roles", () => {
      const skills = deriveSkills("some-unknown-role");
      expect(skills.some((s) => s.id === "task-execute")).toBe(true);
    });

    it("returns array of valid skill shapes", () => {
      const skills = deriveSkills("memory-curator");
      for (const s of skills) {
        expect(s).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
          tags: expect.any(Array),
          inputModes: ["text"],
          outputModes: ["text"],
        });
      }
    });
  });
  ```

- [ ] **Step 3: Run test to verify it fails**

  ```bash
  npx vitest run src/lib/dispatch/__tests__/derive-skills.test.ts
  ```

  Expected: FAIL — `Cannot find module '../derive-skills'`

- [ ] **Step 4: Create `src/lib/dispatch/derive-skills.ts`**

  ```typescript
  import type { AgentCardSkill } from "@/types";

  const ROLE_RULES: Array<{ pattern: RegExp; skill: AgentCardSkill }> = [
    {
      pattern: /memory|recall|consolidat/i,
      skill: {
        id: "memory-write",
        name: "Memory Write",
        description: "Store and retrieve agent memory entries",
        tags: ["memory", "persistence"],
        inputModes: ["text"],
        outputModes: ["text"],
      },
    },
    {
      pattern: /dev|engineer|code|program|software/i,
      skill: {
        id: "code-execute",
        name: "Code Execution",
        description: "Write and execute code in sandboxed environments",
        tags: ["code", "execution"],
        inputModes: ["text"],
        outputModes: ["text"],
      },
    },
    {
      pattern: /research|search|analys|investigat/i,
      skill: {
        id: "web-search",
        name: "Web Search",
        description: "Search the web and retrieve information",
        tags: ["search", "research"],
        inputModes: ["text"],
        outputModes: ["text"],
      },
    },
    {
      pattern: /manager|product|pm|plan|orchestrat/i,
      skill: {
        id: "task-planning",
        name: "Task Planning",
        description: "Break down goals into structured task plans",
        tags: ["planning", "coordination"],
        inputModes: ["text"],
        outputModes: ["text"],
      },
    },
  ];

  const DEFAULT_SKILL: AgentCardSkill = {
    id: "task-execute",
    name: "Task Execution",
    description: "Execute general-purpose tasks and return results",
    tags: ["general"],
    inputModes: ["text"],
    outputModes: ["text"],
  };

  export function deriveSkills(role: string): AgentCardSkill[] {
    const matched = ROLE_RULES.filter((r) => r.pattern.test(role)).map(
      (r) => r.skill
    );
    return matched.length > 0 ? matched : [DEFAULT_SKILL];
  }
  ```

- [ ] **Step 5: Run tests to verify they pass**

  ```bash
  npx vitest run src/lib/dispatch/__tests__/derive-skills.test.ts
  ```

  Expected: 6 tests PASS

- [ ] **Step 6: Commit**

  ```bash
  git add src/types/index.ts src/lib/dispatch/derive-skills.ts src/lib/dispatch/__tests__/derive-skills.test.ts
  git commit -m "feat(dispatch): add AgentCardSkill type + deriveSkills heuristic"
  ```

---

## Task 2: `buildAgentCard` helper + card API routes + tests

**Files:**
- Create: `src/lib/dispatch/build-agent-card.ts`
- Create: `src/app/api/agents/[id]/card/route.ts`
- Create: `src/app/api/agents/cards/route.ts`
- Create: `src/app/api/agents/__tests__/card.test.ts`

- [ ] **Step 1: Write failing tests**

  Create `src/app/api/agents/__tests__/card.test.ts`:

  ```typescript
  // @vitest-environment node
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const MOCK_AGENTS = [
    {
      id: "sophia",
      name: "Sophia",
      role: "software-developer",
      platform: "openclaw" as const,
      location: "tailscale" as const,
      host: "sophia.local",
      port: 3100,
      healthEndpoint: "/health",
      tunnelUrl: undefined,
    },
    {
      id: "alba",
      name: "Alba",
      role: "memory-curator",
      platform: "hermes" as const,
      location: "local" as const,
      host: "localhost",
      port: 3200,
      healthEndpoint: "/health",
      tunnelUrl: undefined,
    },
  ];

  vi.mock("@/lib/agent-registry", () => ({
    getRemoteAgents: () => MOCK_AGENTS,
  }));

  describe("GET /api/agents/cards", () => {
    it("returns all agent cards with A2A shape", async () => {
      const { GET } = await import("../cards/route");
      const req = new Request("http://localhost/api/agents/cards");
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.cards).toHaveLength(2);
      const card = body.cards[0];
      expect(card).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        version: "1",
        url: expect.any(String),
        capabilities: expect.any(Object),
        authentication: expect.any(Object),
        skills: expect.any(Array),
        extensions: expect.objectContaining({ kitchen: expect.any(Object) }),
      });
    });
  });

  describe("GET /api/agents/[id]/card", () => {
    beforeEach(() => {
      vi.resetModules();
      vi.mock("@/lib/agent-registry", () => ({
        getRemoteAgents: () => MOCK_AGENTS,
      }));
    });

    it("returns card for known agent id", async () => {
      const { GET } = await import("../[id]/card/route");
      const req = new Request("http://localhost/api/agents/sophia/card");
      const res = await GET(req, { params: Promise.resolve({ id: "sophia" }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.name).toBe("Sophia");
      expect(body.version).toBe("1");
    });

    it("returns 404 for unknown agent id", async () => {
      const { GET } = await import("../[id]/card/route");
      const req = new Request("http://localhost/api/agents/unknown/card");
      const res = await GET(req, { params: Promise.resolve({ id: "unknown" }) });
      expect(res.status).toBe(404);
    });

    it("card skills are derived from role", async () => {
      const { GET } = await import("../[id]/card/route");
      const req = new Request("http://localhost/api/agents/alba/card");
      const res = await GET(req, { params: Promise.resolve({ id: "alba" }) });
      const body = await res.json();

      expect(body.skills.some((s: { id: string }) => s.id === "memory-write")).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  npx vitest run src/app/api/agents/__tests__/card.test.ts
  ```

  Expected: FAIL — modules not found

- [ ] **Step 3: Create `src/lib/dispatch/build-agent-card.ts`**

  ```typescript
  import type { RemoteAgentConfig } from "@/types";
  import { deriveSkills } from "./derive-skills";

  export interface AgentCard {
    name: string;
    description: string;
    version: "1";
    url: string;
    capabilities: {
      streaming: boolean;
      pushNotifications: boolean;
      stateTransitionHistory: boolean;
    };
    authentication: {
      schemes: string[];
    };
    skills: ReturnType<typeof deriveSkills>;
    extensions: {
      kitchen: {
        id: string;
        platform: string;
        location: string;
        role: string;
      };
    };
  }

  export function buildAgentCard(agent: RemoteAgentConfig): AgentCard {
    const baseUrl =
      agent.location === "cloudflare" && agent.tunnelUrl
        ? agent.tunnelUrl
        : `http://${agent.host}:${agent.port}`;

    const skills =
      agent.skills && agent.skills.length > 0
        ? agent.skills
        : deriveSkills(agent.role);

    return {
      name: agent.name,
      description: `${agent.name} — ${agent.role} agent (${agent.platform})`,
      version: "1",
      url: baseUrl,
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
      authentication: {
        schemes: ["none"],
      },
      skills,
      extensions: {
        kitchen: {
          id: agent.id,
          platform: agent.platform,
          location: agent.location,
          role: agent.role,
        },
      },
    };
  }
  ```

- [ ] **Step 4: Create `src/app/api/agents/cards/route.ts`**

  ```typescript
  import { getRemoteAgents } from "@/lib/agent-registry";
  import { buildAgentCard } from "@/lib/dispatch/build-agent-card";

  export const dynamic = "force-dynamic";

  export async function GET() {
    const agents = getRemoteAgents();
    const cards = agents.map((a) => buildAgentCard(a));
    return Response.json({ cards, timestamp: new Date().toISOString() });
  }
  ```

- [ ] **Step 5: Create `src/app/api/agents/[id]/card/route.ts`**

  ```typescript
  import type { NextRequest } from "next/server";
  import { getRemoteAgents } from "@/lib/agent-registry";
  import { buildAgentCard } from "@/lib/dispatch/build-agent-card";

  export const dynamic = "force-dynamic";

  export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const { id } = await params;
    const agents = getRemoteAgents();
    const agent = agents.find((a) => a.id === id);
    if (!agent) {
      return Response.json({ error: `Agent not found: ${id}` }, { status: 404 });
    }
    return Response.json(buildAgentCard(agent));
  }
  ```

- [ ] **Step 6: Run tests to verify they pass**

  ```bash
  npx vitest run src/app/api/agents/__tests__/card.test.ts
  ```

  Expected: 4 tests PASS

- [ ] **Step 7: Commit**

  ```bash
  git add src/lib/dispatch/build-agent-card.ts src/app/api/agents/cards/route.ts "src/app/api/agents/[id]/card/route.ts" src/app/api/agents/__tests__/card.test.ts
  git commit -m "feat(dispatch): A2A agent card API endpoints + buildAgentCard helper"
  ```

---

## Task 3: React Query hooks for dispatch UI

**Files:**
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Add three hooks to `src/lib/api-client.ts`**

  Open `src/lib/api-client.ts`. At the end of the file, add:

  ```typescript
  export function useDelegations(limit = 50) {
    return useQuery({
      queryKey: ["delegations", limit],
      queryFn: () =>
        fetchJSON<{
          delegations: Array<{
            task_id: string;
            from_agent: string;
            to_agent: string;
            task_summary: string;
            priority: number;
            status: string;
            created_at: string;
            updated_at: string;
          }>;
          timestamp: string;
        }>(`/api/hive?type=delegation&limit=${limit}`),
      refetchInterval: POLL_INTERVALS.hive,
    });
  }

  export function useLineage(taskId: string | null) {
    return useQuery({
      queryKey: ["lineage", taskId],
      queryFn: () =>
        fetchJSON<{
          task_id: string;
          context_id: string | null;
          delegation: Record<string, unknown> | null;
          actions: Array<{
            id: number;
            agent_id: string;
            action_type: string;
            summary: string;
            artifacts: Record<string, unknown> | null;
            timestamp: string;
          }>;
          timestamp: string;
        }>(`/api/hive?task_id=${taskId}`),
      enabled: !!taskId,
    });
  }

  export function useAgentCards() {
    return useQuery({
      queryKey: ["agent-cards"],
      queryFn: () =>
        fetchJSON<{
          cards: Array<{
            name: string;
            description: string;
            version: string;
            url: string;
            capabilities: Record<string, boolean>;
            authentication: { schemes: string[] };
            skills: Array<{ id: string; name: string; description: string; tags: string[] }>;
            extensions: { kitchen: { id: string; platform: string; location: string; role: string } };
          }>;
          timestamp: string;
        }>("/api/agents/cards"),
      refetchInterval: POLL_INTERVALS.health,
    });
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/api-client.ts
  git commit -m "feat(dispatch): add useDelegations, useLineage, useAgentCards hooks"
  ```

---

## Task 4: `LineageDrawer` component + tests

**Files:**
- Create: `src/components/dispatch/lineage-drawer.tsx`
- Create: `src/components/dispatch/__tests__/lineage-drawer.test.tsx`

- [ ] **Step 1: Write failing test**

  Create `src/components/dispatch/__tests__/lineage-drawer.test.tsx`:

  ```typescript
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@testing-library/react";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

  // Sheet uses @base-ui/react/dialog which requires a real DOM portal — mock it
  vi.mock("@/components/ui/sheet", () => ({
    Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetContent: ({ children }: { children: React.ReactNode }) => <div data-testid="sheet-content">{children}</div>,
    SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  }));

  vi.mock("@/lib/api-client", () => ({
    useLineage: (taskId: string | null) => ({
      data: taskId
        ? {
            task_id: taskId,
            context_id: "ctx-1",
            delegation: { task_summary: "test task", from_agent: "kitchen", to_agent: "sophia" },
            actions: [
              { id: 1, agent_id: "sophia", action_type: "checkpoint", summary: "step 1 done", artifacts: null, timestamp: "2026-04-19T10:00:00Z" },
              { id: 2, agent_id: "sophia", action_type: "stop", summary: "completed", artifacts: null, timestamp: "2026-04-19T10:01:00Z" },
            ],
            timestamp: "2026-04-19T10:01:00Z",
          }
        : undefined,
      isLoading: false,
    }),
  }));

  import { LineageDrawer } from "../lineage-drawer";

  function wrap(ui: React.ReactElement) {
    const qc = new QueryClient();
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  }

  describe("LineageDrawer", () => {
    it("renders trigger button", () => {
      wrap(<LineageDrawer taskId="t1" taskSummary="test task" />);
      expect(screen.getByRole("button", { name: /timeline/i })).toBeInTheDocument();
    });

    it("shows action list when taskId is set", () => {
      wrap(<LineageDrawer taskId="t1" taskSummary="test task" />);
      expect(screen.getByText("step 1 done")).toBeInTheDocument();
      expect(screen.getByText("completed")).toBeInTheDocument();
    });

    it("renders nothing inside sheet when taskId is null", () => {
      wrap(<LineageDrawer taskId={null} taskSummary="" />);
      // should not error — just renders the trigger disabled
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npx vitest run src/components/dispatch/__tests__/lineage-drawer.test.tsx
  ```

  Expected: FAIL — `Cannot find module '../lineage-drawer'`

- [ ] **Step 3: Create `src/components/dispatch/lineage-drawer.tsx`**

  ```typescript
  "use client";

  import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetTrigger,
  } from "@/components/ui/sheet";
  import { useLineage } from "@/lib/api-client";

  const ACTION_COLORS: Record<string, string> = {
    continue: "text-sky-400",
    loop: "text-violet-400",
    checkpoint: "text-amber-400",
    trigger: "text-emerald-400",
    stop: "text-slate-400",
    error: "text-rose-400",
  };

  interface LineageDrawerProps {
    taskId: string | null;
    taskSummary: string;
  }

  export function LineageDrawer({ taskId, taskSummary }: LineageDrawerProps) {
    const { data, isLoading } = useLineage(taskId);

    return (
      <Sheet>
        <SheetTrigger asChild>
          <button
            className="text-xs text-slate-400 hover:text-amber-400 transition-colors disabled:opacity-40"
            disabled={!taskId}
          >
            Timeline →
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[480px] bg-slate-950 border-slate-800 overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-amber-500">Task Lineage</SheetTitle>
            <SheetDescription className="text-slate-400 text-sm truncate">
              {taskSummary || taskId}
            </SheetDescription>
          </SheetHeader>

          {isLoading && (
            <p className="text-slate-500 text-sm animate-pulse">Loading…</p>
          )}

          {!isLoading && data && (
            <ol className="relative border-l border-slate-800 ml-3 space-y-6">
              {data.actions.map((action) => (
                <li key={action.id} className="ml-4">
                  <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-slate-700 border border-slate-600" />
                  <p
                    className={`text-xs font-mono uppercase tracking-wide ${
                      ACTION_COLORS[action.action_type] ?? "text-slate-400"
                    }`}
                  >
                    {action.action_type}
                    <span className="ml-2 text-slate-600 normal-case tracking-normal">
                      {new Date(action.timestamp).toLocaleTimeString()}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-slate-300">{action.summary}</p>
                  {action.artifacts && (
                    <pre className="mt-1 text-xs text-slate-600 overflow-x-auto">
                      {JSON.stringify(action.artifacts, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
              {data.actions.length === 0 && (
                <li className="ml-4 text-slate-500 text-sm">No actions recorded yet.</li>
              )}
            </ol>
          )}
        </SheetContent>
      </Sheet>
    );
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npx vitest run src/components/dispatch/__tests__/lineage-drawer.test.tsx
  ```

  Expected: 3 tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/dispatch/lineage-drawer.tsx src/components/dispatch/__tests__/lineage-drawer.test.tsx
  git commit -m "feat(dispatch): LineageDrawer sheet component + tests"
  ```

---

## Task 5: `DispatchPanel` + `AgentCardsPanel` + tests

**Files:**
- Create: `src/components/dispatch/dispatch-panel.tsx`
- Create: `src/components/dispatch/agent-cards-panel.tsx`
- Create: `src/components/dispatch/__tests__/dispatch-panel.test.tsx`

- [ ] **Step 1: Write failing tests**

  Create `src/components/dispatch/__tests__/dispatch-panel.test.tsx`:

  ```typescript
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, fireEvent, waitFor } from "@testing-library/react";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

  vi.mock("@/components/ui/sheet", () => ({
    Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  }));

  const MOCK_AGENTS = [
    { id: "sophia", name: "Sophia", role: "developer", platform: "openclaw", location: "tailscale", host: "h", port: 3100, healthEndpoint: "/health" },
  ];

  const MOCK_DELEGATIONS = [
    {
      task_id: "t1",
      from_agent: "kitchen",
      to_agent: "sophia",
      task_summary: "build the widget",
      priority: 3,
      status: "active",
      created_at: "2026-04-19T10:00:00Z",
      updated_at: "2026-04-19T10:01:00Z",
    },
  ];

  vi.mock("@/lib/api-client", () => ({
    useAgents: () => ({ data: { agents: MOCK_AGENTS }, isLoading: false }),
    useDelegations: () => ({ data: { delegations: MOCK_DELEGATIONS }, isLoading: false }),
    useLineage: () => ({ data: undefined, isLoading: false }),
  }));

  import { DispatchPanel } from "../dispatch-panel";

  function wrap(ui: React.ReactElement) {
    const qc = new QueryClient();
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  }

  describe("DispatchPanel", () => {
    it("renders dispatch form with agent selector", () => {
      wrap(<DispatchPanel />);
      expect(screen.getByText(/dispatch/i)).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("shows delegation list with existing delegations", () => {
      wrap(<DispatchPanel />);
      expect(screen.getByText("build the widget")).toBeInTheDocument();
      expect(screen.getByText("sophia")).toBeInTheDocument();
    });

    it("shows status badge for each delegation", () => {
      wrap(<DispatchPanel />);
      expect(screen.getByText("active")).toBeInTheDocument();
    });

    it("submit button is disabled when form is empty", () => {
      wrap(<DispatchPanel />);
      const btn = screen.getByRole("button", { name: /dispatch/i });
      expect(btn).toBeDisabled();
    });
  });

  describe("AgentCardsPanel", () => {
    it("renders agent cards", async () => {
      vi.doMock("@/lib/api-client", () => ({
        useAgentCards: () => ({
          data: {
            cards: [
              {
                name: "Sophia",
                description: "Sophia — developer agent (openclaw)",
                version: "1",
                url: "http://sophia.local:3100",
                capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
                authentication: { schemes: ["none"] },
                skills: [{ id: "code-execute", name: "Code Execution", description: "...", tags: ["code"] }],
                extensions: { kitchen: { id: "sophia", platform: "openclaw", location: "tailscale", role: "developer" } },
              },
            ],
            timestamp: "2026-04-19T10:00:00Z",
          },
          isLoading: false,
        }),
      }));
      const { AgentCardsPanel } = await import("../agent-cards-panel");
      wrap(<AgentCardsPanel />);
      expect(screen.getByText("Sophia")).toBeInTheDocument();
      expect(screen.getByText("Code Execution")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  npx vitest run src/components/dispatch/__tests__/dispatch-panel.test.tsx
  ```

  Expected: FAIL — modules not found

- [ ] **Step 3: Create `src/components/dispatch/dispatch-panel.tsx`**

  ```typescript
  "use client";

  import { useState } from "react";
  import { useAgents, useDelegations } from "@/lib/api-client";
  import { LineageDrawer } from "./lineage-drawer";

  const STATUS_COLORS: Record<string, string> = {
    pending: "text-slate-400 bg-slate-800",
    active: "text-emerald-400 bg-emerald-900/30",
    paused: "text-amber-400 bg-amber-900/30",
    completed: "text-sky-400 bg-sky-900/30",
    failed: "text-rose-400 bg-rose-900/30",
    canceled: "text-slate-500 bg-slate-900",
  };

  export function DispatchPanel() {
    const { data: agentsData } = useAgents();
    const { data: delegationsData, isLoading } = useDelegations();
    const [toAgent, setToAgent] = useState("");
    const [taskSummary, setTaskSummary] = useState("");
    const [priority, setPriority] = useState("5");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const agents = agentsData?.agents ?? [];
    const delegations = delegationsData?.delegations ?? [];

    async function handleDispatch() {
      if (!toAgent || !taskSummary.trim()) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to_agent: toAgent, task_summary: taskSummary, priority: Number(priority) }),
        });
        if (!res.ok) {
          const body = await res.json();
          setError(body.error ?? "Dispatch failed");
        } else {
          setTaskSummary("");
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setSubmitting(false);
      }
    }

    return (
      <div className="space-y-6">
        {/* Dispatch form */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-amber-500 mb-4">Dispatch Task</h2>
          <div className="space-y-3">
            <div className="flex gap-3">
              <select
                value={toAgent}
                onChange={(e) => setToAgent(e.target.value)}
                className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="">Select agent…</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-24 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => (
                  <option key={p} value={p}>
                    P{p}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={taskSummary}
              onChange={(e) => setTaskSummary(e.target.value)}
              placeholder="Task summary…"
              rows={3}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
            />
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              onClick={handleDispatch}
              disabled={!toAgent || !taskSummary.trim() || submitting}
              className="w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Dispatching…" : "Dispatch"}
            </button>
          </div>
        </section>

        {/* Delegation list */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-amber-500 mb-4">Live Delegations</h2>
          {isLoading && <p className="text-slate-500 text-sm animate-pulse">Loading…</p>}
          {!isLoading && delegations.length === 0 && (
            <p className="text-slate-600 text-sm">No delegations yet.</p>
          )}
          <div className="space-y-2">
            {delegations.map((d) => (
              <div
                key={d.task_id}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200 truncate">{d.task_summary}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    → <span className="text-slate-400">{d.to_agent}</span>
                    <span className="mx-1">·</span>P{d.priority}
                    <span className="mx-1">·</span>
                    {new Date(d.created_at).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                      STATUS_COLORS[d.status] ?? "text-slate-400 bg-slate-800"
                    }`}
                  >
                    {d.status}
                  </span>
                  <LineageDrawer taskId={d.task_id} taskSummary={d.task_summary} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }
  ```

- [ ] **Step 4: Create `src/components/dispatch/agent-cards-panel.tsx`**

  ```typescript
  "use client";

  import { useAgentCards } from "@/lib/api-client";

  export function AgentCardsPanel() {
    const { data, isLoading } = useAgentCards();
    const cards = data?.cards ?? [];

    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-amber-500 mb-4">A2A Agent Cards</h2>
        {isLoading && <p className="text-slate-500 text-sm animate-pulse">Loading…</p>}
        {!isLoading && cards.length === 0 && (
          <p className="text-slate-600 text-sm">No agents configured.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <div
              key={card.extensions.kitchen.id}
              className="rounded-lg border border-slate-700 bg-slate-950 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-200">{card.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{card.extensions.kitchen.role}</p>
                </div>
                <span className="text-xs text-slate-600 font-mono bg-slate-800 px-2 py-0.5 rounded">
                  {card.extensions.kitchen.platform}
                </span>
              </div>
              <p className="text-xs text-slate-400 break-all">{card.url}</p>
              {card.skills.length > 0 && (
                <div>
                  <p className="text-xs text-slate-600 mb-1">Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {card.skills.map((s) => (
                      <span
                        key={s.id}
                        className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded"
                        title={s.description}
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-xs text-slate-600">
                auth: {card.authentication.schemes.join(", ")} · v{card.version}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }
  ```

- [ ] **Step 5: Run tests to verify they pass**

  ```bash
  npx vitest run src/components/dispatch/__tests__/dispatch-panel.test.tsx
  ```

  Expected: 5 tests PASS

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/dispatch/dispatch-panel.tsx src/components/dispatch/agent-cards-panel.tsx src/components/dispatch/__tests__/dispatch-panel.test.tsx
  git commit -m "feat(dispatch): DispatchPanel + AgentCardsPanel components + tests"
  ```

---

## Task 6: `/dispatch` page + sidebar nav item

**Files:**
- Create: `src/app/dispatch/page.tsx`
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Create `src/app/dispatch/page.tsx`**

  ```typescript
  import { DispatchPanel } from "@/components/dispatch/dispatch-panel";
  import { AgentCardsPanel } from "@/components/dispatch/agent-cards-panel";

  export default function DispatchPage() {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold text-amber-500">The Dispatch</h1>
          <p className="text-sm text-slate-500 mt-1">
            Send tasks to remote agents and monitor delegations
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <DispatchPanel />
          <AgentCardsPanel />
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Add nav item to `src/components/layout/sidebar.tsx`**

  Find the `NAV_ITEMS` array and add the dispatch entry after the flow entry:

  ```typescript
  const NAV_ITEMS = [
    { href: "/", label: "Kitchen Floor", icon: "👨‍🍳" },
    { href: "/ledger", label: "The Ledger", icon: "🧾" },
    { href: "/notebooks", label: "Notebook Wall", icon: "🧠" },
    { href: "/library", label: "The Library", icon: "📚" },
    { href: "/cookbooks", label: "The Cookbooks", icon: "📚" },
    { href: "/flow", label: "The Flow", icon: "🔄" },
    { href: "/dispatch", label: "The Dispatch", icon: "📡" },
    { href: "/apo", label: "The Sous Vide", icon: "🍲" },
  ];
  ```

  (Only the one-line addition of `{ href: "/dispatch", label: "The Dispatch", icon: "📡" }` is needed — match the existing array order)

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors

- [ ] **Step 4: Run full test suite**

  ```bash
  npx vitest run
  ```

  Expected: all tests pass (no regressions)

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/dispatch/page.tsx src/components/layout/sidebar.tsx
  git commit -m "feat(dispatch): /dispatch page + sidebar nav item"
  ```

---

## Verification Checklist

After all tasks complete:

- [ ] `GET /api/agents/cards` returns A2A-shaped cards for all agents in `agents.config.json`
- [ ] `GET /api/agents/sophia/card` (or any valid agent id) returns a single card with status 200
- [ ] `GET /api/agents/nonexistent/card` returns 404
- [ ] `/dispatch` page loads without error in the browser
- [ ] "The Dispatch" appears in sidebar navigation
- [ ] Dispatch form is disabled until both agent and summary are filled
- [ ] Submitting dispatches a POST to `/api/dispatch` and clears the textarea on success
- [ ] Delegation list polls every 5s and shows live delegations
- [ ] Clicking "Timeline →" on a delegation opens the lineage drawer
- [ ] AgentCardsPanel grid shows one card per agent with name, URL, skills, auth

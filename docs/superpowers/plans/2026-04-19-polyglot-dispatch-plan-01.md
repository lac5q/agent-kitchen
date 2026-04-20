# Polyglot Agent Dispatch — Plan 01 (Backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the provider-agnostic dispatch backend — schema migrations, adapters, `/api/dispatch` route, poll script, and full test coverage — so any agent can be dispatched from the Kitchen without touching a vendor SDK.

**Architecture:** `hive_delegations` is the task queue (SQLite, zero broker). Two adapters handle delivery: `openclaw` (file-drop to `~/.openclaw/delivery-queue/`) for `platform=opencode`, and `hive-poll` (null, agent polls `/api/hive`) for `claude|codex|qwen|gemini`. The `/api/dispatch` POST route writes the delegation row, selects the adapter, calls it, and returns `{ok,task_id,context_id,adapter,mode}`. Zero LLM calls in this path.

**Tech Stack:** Next.js App Router, better-sqlite3, Vitest, Node.js `fs/promises`, bash + curl + python3 (poll script)

**Spec:** `docs/superpowers/specs/2026-04-19-polyglot-agent-dispatch-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/db-schema.ts` | ALTER TABLE migrations + status CHECK rebuild + two indexes |
| Create | `src/lib/dispatch/types.ts` | `DispatchTask`, `DispatchResult`, `AgentAdapter` interfaces |
| Create | `src/lib/dispatch/hive-poll-adapter.ts` | Null adapter; returns `mode:"queued"` |
| Create | `src/lib/dispatch/openclaw-adapter.ts` | File-drop adapter for `platform=opencode` |
| Create | `src/lib/dispatch/adapter-factory.ts` | `selectAdapter(agent): AgentAdapter` |
| Create | `src/app/api/dispatch/route.ts` | POST handler per spec §3 |
| Modify | `src/app/api/hive/route.ts` | +`canceled` status; +`result` on delegation upsert; +lineage GET |
| Create | `src/lib/dispatch/__tests__/hive-poll-adapter.test.ts` | Unit test |
| Create | `src/lib/dispatch/__tests__/openclaw-adapter.test.ts` | Unit test with tempdir |
| Create | `src/lib/dispatch/__tests__/adapter-factory.test.ts` | Fixture: all 5 agents resolve correctly |
| Create | `src/app/api/dispatch/__tests__/route.test.ts` | E2E: 9 test cases |
| Create | `src/app/api/hive/__tests__/lineage.test.ts` | Lineage GET tests |
| Install | `~/.hive/poll.sh` | Bash poll loop (not in repo; installed by Task 8) |

---

## Task 1: Schema Migrations

**Files:**
- Modify: `src/lib/db-schema.ts`

- [ ] **Step 1: Read the existing migration pattern**

Open `src/lib/db-schema.ts` lines 176-184. Note the `try/catch` wrapping `ALTER TABLE messages ADD COLUMN consolidated`. All new migrations follow this exact pattern.

- [ ] **Step 2: Add additive column migrations**

In `src/lib/db-schema.ts`, append these two blocks immediately after the `ALTER TABLE messages ADD COLUMN consolidated` try/catch block (after line 181):

```typescript
  // Additive migration: add context_id to hive_delegations (dispatch chain grouping)
  try {
    db.exec('ALTER TABLE hive_delegations ADD COLUMN context_id TEXT');
  } catch {
    // Column already exists
  }

  // Additive migration: add result to hive_delegations (terminal payload storage)
  try {
    db.exec('ALTER TABLE hive_delegations ADD COLUMN result TEXT');
  } catch {
    // Column already exists
  }
```

- [ ] **Step 3: Add the status CHECK rebuild migration**

Append this block after the two column migrations. It rebuilds `hive_delegations` to add `canceled` to the CHECK constraint, guarded by a `meta` flag so it runs at most once:

```typescript
  // One-shot migration: rebuild hive_delegations CHECK constraint to add 'canceled' status.
  // Guarded by meta flag — SQLite cannot ALTER a CHECK constraint in place.
  const migrated = db
    .prepare(`SELECT value FROM meta WHERE key = 'hive_delegations_v2_migrated'`)
    .get() as { value: string } | undefined;
  if (!migrated) {
    db.exec(`
      CREATE TABLE hive_delegations_new (
        id            INTEGER PRIMARY KEY,
        task_id       TEXT    NOT NULL UNIQUE,
        from_agent    TEXT    NOT NULL,
        to_agent      TEXT    NOT NULL,
        task_summary  TEXT    NOT NULL,
        priority      INTEGER NOT NULL DEFAULT 5,
        status        TEXT    NOT NULL DEFAULT 'pending'
                      CHECK(status IN ('pending','active','paused','completed','failed','canceled')),
        checkpoint    TEXT,
        context_id    TEXT,
        result        TEXT,
        created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      );
      INSERT INTO hive_delegations_new
        SELECT id, task_id, from_agent, to_agent, task_summary, priority, status,
               checkpoint, context_id, result, created_at, updated_at
        FROM hive_delegations;
      DROP TABLE hive_delegations;
      ALTER TABLE hive_delegations_new RENAME TO hive_delegations;
    `);
    db.prepare(`INSERT OR REPLACE INTO meta(key,value) VALUES('hive_delegations_v2_migrated','1')`).run();
  }
```

- [ ] **Step 4: Add two new indexes**

Append after the status rebuild block:

```typescript
  // Indexes for dispatch query patterns
  db.exec(`
    CREATE INDEX IF NOT EXISTS hive_delegations_context
      ON hive_delegations(context_id);
    CREATE INDEX IF NOT EXISTS hive_delegations_status_priority
      ON hive_delegations(status, priority DESC, created_at ASC);
  `);
```

- [ ] **Step 5: Verify the schema initializes cleanly**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx tsx -e "
import { getDb } from './src/lib/db.ts';
const db = getDb();
const info = db.prepare(\"PRAGMA table_info(hive_delegations)\").all();
console.log(JSON.stringify(info.map((c: any) => c.name), null, 2));
const meta = db.prepare(\"SELECT * FROM meta WHERE key='hive_delegations_v2_migrated'\").get();
console.log('migrated:', meta);
"
```

Expected output: columns array includes `context_id` and `result`; migrated key shows `value:'1'`.

- [ ] **Step 6: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen && git add src/lib/db-schema.ts && git commit -m "feat(dispatch): schema v2 — context_id, result, canceled status, two indexes"
```

---

## Task 2: Dispatch Types

**Files:**
- Create: `src/lib/dispatch/types.ts`

- [ ] **Step 1: Create the types file**

```bash
mkdir -p /Users/lcalderon/github/agent-kitchen/src/lib/dispatch
```

Create `src/lib/dispatch/types.ts`:

```typescript
import type { AgentPlatform } from "@/types";

export interface DispatchTask {
  task_id: string;
  context_id: string;
  from_agent: string;
  to_agent: string;
  task_summary: string;
  input?: Record<string, unknown>;
  priority: number;
  dispatched_at: string;
}

export interface DispatchResult {
  accepted: boolean;
  mode: "pushed" | "queued" | "rejected";
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface AgentAdapter {
  readonly platform: AgentPlatform | AgentPlatform[];
  readonly name: string;
  dispatch(task: DispatchTask): Promise<DispatchResult>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen && git add src/lib/dispatch/types.ts && git commit -m "feat(dispatch): DispatchTask, DispatchResult, AgentAdapter types"
```

---

## Task 3: Hive-Poll Adapter + Tests

**Files:**
- Create: `src/lib/dispatch/hive-poll-adapter.ts`
- Create: `src/lib/dispatch/__tests__/hive-poll-adapter.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `src/lib/dispatch/__tests__/hive-poll-adapter.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { hivePollAdapter } from "../hive-poll-adapter";

const task = {
  task_id: "abc-123",
  context_id: "ctx-456",
  from_agent: "kitchen",
  to_agent: "sophia",
  task_summary: "Draft blog post",
  priority: 5,
  dispatched_at: "2026-04-19T10:00:00Z",
};

describe("hivePollAdapter", () => {
  it("returns mode:queued and accepted:true unconditionally", async () => {
    const result = await hivePollAdapter.dispatch(task);
    expect(result.accepted).toBe(true);
    expect(result.mode).toBe("queued");
    expect(result.detail).toContain(task.task_id);
  });

  it("covers all hive-poll platforms", () => {
    const platforms = Array.isArray(hivePollAdapter.platform)
      ? hivePollAdapter.platform
      : [hivePollAdapter.platform];
    expect(platforms).toContain("claude");
    expect(platforms).toContain("codex");
    expect(platforms).toContain("qwen");
    expect(platforms).toContain("gemini");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx vitest run src/lib/dispatch/__tests__/hive-poll-adapter.test.ts 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module '../hive-poll-adapter'`

- [ ] **Step 3: Implement the adapter**

Create `src/lib/dispatch/hive-poll-adapter.ts`:

```typescript
import type { AgentAdapter, DispatchTask, DispatchResult } from "./types";

export const hivePollAdapter: AgentAdapter = {
  platform: ["claude", "codex", "qwen", "gemini"],
  name: "hive-poll",
  async dispatch(task: DispatchTask): Promise<DispatchResult> {
    return {
      accepted: true,
      mode: "queued",
      detail: `Task ${task.task_id} queued in hive for ${task.to_agent}; awaits poll.`,
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx vitest run src/lib/dispatch/__tests__/hive-poll-adapter.test.ts 2>&1 | tail -10
```

Expected: PASS — 2 tests

- [ ] **Step 5: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen && git add src/lib/dispatch/hive-poll-adapter.ts src/lib/dispatch/__tests__/hive-poll-adapter.test.ts && git commit -m "feat(dispatch): hive-poll adapter + tests"
```

---

## Task 4: OpenClaw Adapter + Tests

**Files:**
- Create: `src/lib/dispatch/openclaw-adapter.ts`
- Create: `src/lib/dispatch/__tests__/openclaw-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/dispatch/__tests__/openclaw-adapter.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const task = {
  task_id: "task-xyz-001",
  context_id: "ctx-abc-002",
  from_agent: "kitchen",
  to_agent: "alba",
  task_summary: "Coordinate morning standup",
  priority: 3,
  dispatched_at: "2026-04-19T09:00:00Z",
};

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-test-"));
  process.env.OPENCLAW_QUEUE_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.OPENCLAW_QUEUE_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("openclawAdapter", () => {
  it("drops a JSON envelope in the queue dir", async () => {
    // Import AFTER setting env var — module reads env at call time via QUEUE_DIR getter
    const { openclawAdapter } = await import("../openclaw-adapter");
    const result = await openclawAdapter.dispatch(task);
    expect(result.accepted).toBe(true);
    expect(result.mode).toBe("pushed");
    const files = await fs.readdir(tmpDir);
    expect(files).toContain(`${task.task_id}.json`);
    const content = JSON.parse(
      await fs.readFile(path.join(tmpDir, `${task.task_id}.json`), "utf-8")
    );
    expect(content.task_id).toBe(task.task_id);
    expect(content.context_id).toBe(task.context_id);
    expect(content.version).toBe("1");
  });

  it("is idempotent — dispatching twice overwrites, no extra files", async () => {
    const { openclawAdapter } = await import("../openclaw-adapter");
    await openclawAdapter.dispatch(task);
    await openclawAdapter.dispatch(task);
    const files = await fs.readdir(tmpDir);
    expect(files.filter((f) => f.startsWith(task.task_id))).toHaveLength(1);
  });

  it("returns accepted:false when queue dir is unwritable", async () => {
    // Point to a path inside an unwritable location
    process.env.OPENCLAW_QUEUE_DIR = "/dev/null/not-a-dir/queue";
    const { openclawAdapter } = await import("../openclaw-adapter");
    const result = await openclawAdapter.dispatch(task);
    expect(result.accepted).toBe(false);
    expect(result.mode).toBe("rejected");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx vitest run src/lib/dispatch/__tests__/openclaw-adapter.test.ts 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module '../openclaw-adapter'`

- [ ] **Step 3: Implement the adapter**

Create `src/lib/dispatch/openclaw-adapter.ts`:

```typescript
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { AgentAdapter, DispatchTask, DispatchResult } from "./types";

function getQueueDir(): string {
  return (
    process.env.OPENCLAW_QUEUE_DIR ??
    path.join(os.homedir(), ".openclaw", "delivery-queue")
  );
}

interface OpenClawEnvelope {
  version: "1";
  task_id: string;
  context_id: string;
  from_agent: string;
  to_agent: string;
  task_summary: string;
  input?: Record<string, unknown>;
  priority: number;
  dispatched_at: string;
  hive_endpoint: string;
}

export const openclawAdapter: AgentAdapter = {
  platform: "opencode",
  name: "openclaw",
  async dispatch(task: DispatchTask): Promise<DispatchResult> {
    const queueDir = getQueueDir();
    const envelope: OpenClawEnvelope = {
      version: "1",
      task_id: task.task_id,
      context_id: task.context_id,
      from_agent: task.from_agent,
      to_agent: task.to_agent,
      task_summary: task.task_summary,
      input: task.input,
      priority: task.priority,
      dispatched_at: task.dispatched_at,
      hive_endpoint:
        process.env.HIVE_PUBLIC_URL ??
        "https://kitchen.epiloguecapital.com/api/hive",
    };
    const file = path.join(queueDir, `${task.task_id}.json`);
    try {
      await fs.mkdir(queueDir, { recursive: true });
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(envelope, null, 2), "utf-8");
      await fs.rename(tmp, file);
      return {
        accepted: true,
        mode: "pushed",
        detail: `Dropped task ${task.task_id} in OpenClaw queue for ${task.to_agent}`,
        evidence: { path: file },
      };
    } catch (err) {
      return {
        accepted: false,
        mode: "rejected",
        detail: `OpenClaw queue write failed: ${(err as Error).message}`,
        evidence: { path: file },
      };
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

The test uses dynamic imports (re-import after each env var change) to pick up the runtime `OPENCLAW_QUEUE_DIR`. Ensure vitest config does not cache modules between tests by adding `vi.resetModules()` at the top of each test if the import is cached.

```bash
cd /Users/lcalderon/github/agent-kitchen && npx vitest run src/lib/dispatch/__tests__/openclaw-adapter.test.ts 2>&1 | tail -10
```

Expected: PASS — 3 tests

If the "unwritable" test is flaky (root may be able to write anywhere), adjust: use `process.env.OPENCLAW_QUEUE_DIR = "/proc/sys/not-writable"` or mock `fs.mkdir` to throw. Whichever approach makes the test deterministic on macOS is fine.

- [ ] **Step 5: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen && git add src/lib/dispatch/openclaw-adapter.ts src/lib/dispatch/__tests__/openclaw-adapter.test.ts && git commit -m "feat(dispatch): openclaw file-drop adapter + tests"
```

---

## Task 5: Adapter Factory + Tests

**Files:**
- Create: `src/lib/dispatch/adapter-factory.ts`
- Create: `src/lib/dispatch/__tests__/adapter-factory.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/dispatch/__tests__/adapter-factory.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { selectAdapter } from "../adapter-factory";
import { hivePollAdapter } from "../hive-poll-adapter";
import { openclawAdapter } from "../openclaw-adapter";
import type { RemoteAgentConfig } from "@/types";

function makeAgent(id: string, platform: RemoteAgentConfig["platform"]): RemoteAgentConfig {
  return {
    id,
    name: id,
    role: "test",
    platform,
    location: "local",
    host: "localhost",
    port: 3000,
    healthEndpoint: "/health",
  };
}

describe("selectAdapter", () => {
  it("sophia (claude) → hive-poll", () => {
    expect(selectAdapter(makeAgent("sophia", "claude"))).toBe(hivePollAdapter);
  });

  it("maria (claude) → hive-poll", () => {
    expect(selectAdapter(makeAgent("maria", "claude"))).toBe(hivePollAdapter);
  });

  it("lucia (claude) → hive-poll", () => {
    expect(selectAdapter(makeAgent("lucia", "claude"))).toBe(hivePollAdapter);
  });

  it("alba (opencode) → openclaw", () => {
    expect(selectAdapter(makeAgent("alba", "opencode"))).toBe(openclawAdapter);
  });

  it("gwen (claude) → hive-poll (platform=claude, not opencode)", () => {
    expect(selectAdapter(makeAgent("gwen", "claude"))).toBe(hivePollAdapter);
  });

  it("unknown platform falls back to hive-poll", () => {
    // 'codex' is in hive-poll's platform array
    expect(selectAdapter(makeAgent("unknown", "codex"))).toBe(hivePollAdapter);
  });

  it("gemini platform → hive-poll", () => {
    expect(selectAdapter(makeAgent("gemini-agent", "gemini"))).toBe(hivePollAdapter);
  });

  it("qwen platform → hive-poll", () => {
    expect(selectAdapter(makeAgent("qwen-agent", "qwen"))).toBe(hivePollAdapter);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx vitest run src/lib/dispatch/__tests__/adapter-factory.test.ts 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module '../adapter-factory'`

- [ ] **Step 3: Implement the factory**

Create `src/lib/dispatch/adapter-factory.ts`:

```typescript
import type { RemoteAgentConfig } from "@/types";
import type { AgentAdapter } from "./types";
import { openclawAdapter } from "./openclaw-adapter";
import { hivePollAdapter } from "./hive-poll-adapter";

const ADAPTERS: AgentAdapter[] = [openclawAdapter, hivePollAdapter];

export function selectAdapter(agent: RemoteAgentConfig): AgentAdapter {
  const want = agent.platform;
  for (const a of ADAPTERS) {
    const p = a.platform;
    if (Array.isArray(p) ? p.includes(want) : p === want) return a;
  }
  return hivePollAdapter;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx vitest run src/lib/dispatch/__tests__/adapter-factory.test.ts 2>&1 | tail -10
```

Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen && git add src/lib/dispatch/adapter-factory.ts src/lib/dispatch/__tests__/adapter-factory.test.ts && git commit -m "feat(dispatch): selectAdapter factory + all-agent resolution tests"
```

---

## Task 6: `/api/dispatch` Route + Tests

**Files:**
- Create: `src/app/api/dispatch/route.ts`
- Create: `src/app/api/dispatch/__tests__/route.test.ts`

- [ ] **Step 1: Check what getRemoteAgents returns**

```bash
cd /Users/lcalderon/github/agent-kitchen && grep -n "getRemoteAgents\|export" src/lib/agent-registry.ts | head -20
```

Note the function signature and import path. You'll need it in the dispatch route.

- [ ] **Step 2: Write the failing test**

Create `src/app/api/dispatch/__tests__/route.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB so tests don't need a real SQLite file
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/agent-registry", () => ({
  getRemoteAgents: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/content-scanner", () => ({
  scanContent: vi.fn(),
}));

vi.mock("@/lib/dispatch/adapter-factory", () => ({
  selectAdapter: vi.fn(),
}));

const { POST } = await import("../route");
const { getDb } = await import("@/lib/db");
const { getRemoteAgents } = await import("@/lib/agent-registry");
const { scanContent } = await import("@/lib/content-scanner");
const { selectAdapter } = await import("@/lib/dispatch/adapter-factory");

const mockGetDb = vi.mocked(getDb);
const mockGetRemoteAgents = vi.mocked(getRemoteAgents);
const mockScanContent = vi.mocked(scanContent);
const mockSelectAdapter = vi.mocked(selectAdapter);

function makeDb() {
  const rows: object[] = [];
  const prepare = vi.fn().mockReturnValue({
    run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }),
    get: vi.fn().mockReturnValue(undefined),
    all: vi.fn().mockReturnValue(rows),
  });
  return { prepare, exec: vi.fn(), transaction: (fn: () => void) => fn };
}

function makeRequest(body: object) {
  return { json: async () => body } as Request;
}

const sophiaAgent = {
  id: "sophia",
  name: "Sophia",
  role: "Marketing",
  platform: "claude" as const,
  location: "tailscale" as const,
  host: "100.101.88.44",
  port: 18889,
  healthEndpoint: "/health",
};

const hivePollStub = {
  name: "hive-poll",
  platform: ["claude"] as const,
  dispatch: vi.fn().mockResolvedValue({ accepted: true, mode: "queued", detail: "ok" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockReturnValue(makeDb() as any);
  mockGetRemoteAgents.mockReturnValue([sophiaAgent]);
  mockScanContent.mockReturnValue({
    blocked: false,
    matches: [],
    cleanContent: "Draft blog post",
  });
  mockSelectAdapter.mockReturnValue(hivePollStub as any);
});

describe("POST /api/dispatch", () => {
  it("200 — dispatches to sophia via hive-poll", async () => {
    const req = makeRequest({ to_agent: "sophia", task_summary: "Draft blog post" });
    const res = await POST(req as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.to_agent).toBe("sophia");
    expect(body.adapter).toBe("hive-poll");
    expect(body.mode).toBe("queued");
    expect(body.task_id).toBeTruthy();
    expect(body.context_id).toBeTruthy();
  });

  it("400 INVALID_BODY — missing task_summary", async () => {
    const req = makeRequest({ to_agent: "sophia" });
    const res = await POST(req as any);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("INVALID_BODY");
  });

  it("400 INVALID_BODY — missing to_agent", async () => {
    const req = makeRequest({ task_summary: "do something" });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("400 INVALID_BODY — priority out of range (0)", async () => {
    const req = makeRequest({ to_agent: "sophia", task_summary: "x", priority: 0 });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_BODY");
  });

  it("400 INVALID_BODY — priority out of range (10)", async () => {
    const req = makeRequest({ to_agent: "sophia", task_summary: "x", priority: 10 });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("404 UNKNOWN_AGENT — agent not in registry", async () => {
    const req = makeRequest({ to_agent: "ghost", task_summary: "do something" });
    const res = await POST(req as any);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("UNKNOWN_AGENT");
  });

  it("403 CONTENT_BLOCKED — scanContent blocks", async () => {
    mockScanContent.mockReturnValue({ blocked: true, matches: [], cleanContent: "" });
    const req = makeRequest({ to_agent: "sophia", task_summary: "rm -rf /" });
    const res = await POST(req as any);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("CONTENT_BLOCKED");
  });

  it("502 ADAPTER_REJECTED — adapter returns accepted:false", async () => {
    hivePollStub.dispatch.mockResolvedValueOnce({
      accepted: false,
      mode: "rejected",
      detail: "connection refused",
    });
    const req = makeRequest({ to_agent: "sophia", task_summary: "ping" });
    const res = await POST(req as any);
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("ADAPTER_REJECTED");
  });

  it("preserves provided task_id and context_id", async () => {
    const req = makeRequest({
      to_agent: "sophia",
      task_summary: "chain task",
      task_id: "fixed-task-id",
      context_id: "fixed-ctx-id",
    });
    const res = await POST(req as any);
    const body = await res.json();
    expect(body.task_id).toBe("fixed-task-id");
    expect(body.context_id).toBe("fixed-ctx-id");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx vitest run src/app/api/dispatch/__tests__/route.test.ts 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 4: Implement the dispatch route**

Create `src/app/api/dispatch/route.ts`:

```typescript
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { scanContent } from "@/lib/content-scanner";
import { writeAuditLog } from "@/lib/audit";
import { getRemoteAgents } from "@/lib/agent-registry";
import { selectAdapter } from "@/lib/dispatch/adapter-factory";
import type { DispatchTask } from "@/lib/dispatch/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest | Request) {
  const body = await req.json();

  // 1. Validate required fields
  if (!body.task_summary || typeof body.task_summary !== "string") {
    return Response.json(
      { ok: false, error: "task_summary is required", code: "INVALID_BODY" },
      { status: 400 }
    );
  }
  if (!body.to_agent || typeof body.to_agent !== "string") {
    return Response.json(
      { ok: false, error: "to_agent is required", code: "INVALID_BODY" },
      { status: 400 }
    );
  }
  const priority = body.priority != null ? Number(body.priority) : 5;
  if (priority < 1 || priority > 9) {
    return Response.json(
      { ok: false, error: "priority must be 1–9", code: "INVALID_BODY" },
      { status: 400 }
    );
  }

  // 2. Look up agent
  const agents = getRemoteAgents();
  const agent = agents.find((a) => a.id === body.to_agent);
  if (!agent) {
    return Response.json(
      { ok: false, error: `Unknown agent: ${body.to_agent}`, code: "UNKNOWN_AGENT" },
      { status: 404 }
    );
  }

  // 3. Scan content
  const db = getDb();
  const scan = scanContent(body.task_summary);
  const from_agent = body.from_agent ?? "kitchen";
  if (scan.blocked) {
    writeAuditLog(db, {
      actor: from_agent,
      action: "content_blocked",
      target: "dispatch",
      detail: JSON.stringify(scan.matches.map((m: { patternName: string }) => m.patternName)),
      severity: "high",
    });
    return Response.json(
      { ok: false, error: "Content blocked by security scanner", code: "CONTENT_BLOCKED" },
      { status: 403 }
    );
  }
  if (scan.matches.length > 0) {
    writeAuditLog(db, {
      actor: from_agent,
      action: "content_flagged",
      target: "dispatch",
      detail: JSON.stringify(scan.matches.map((m: { patternName: string }) => m.patternName)),
      severity: "medium",
    });
  }

  // 4. Generate IDs
  const task_id: string = body.task_id ?? crypto.randomUUID();
  const context_id: string = body.context_id ?? crypto.randomUUID();
  const dispatched_at = new Date().toISOString();

  // 5. Write delegation row + trigger action
  db.prepare(
    `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, checkpoint, context_id, result)
     VALUES (@task_id, @from_agent, @to_agent, @task_summary, @priority, 'pending', NULL, @context_id, NULL)
     ON CONFLICT(task_id) DO NOTHING`
  ).run({
    task_id,
    from_agent,
    to_agent: body.to_agent,
    task_summary: scan.cleanContent,
    priority,
    context_id,
  });

  const adapter = selectAdapter(agent);

  db.prepare(
    `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
     VALUES (@agent_id, 'trigger', @summary, @artifacts)`
  ).run({
    agent_id: from_agent,
    summary: `Dispatch: ${scan.cleanContent.slice(0, 120)}`,
    artifacts: JSON.stringify({
      task_id,
      context_id,
      to_agent: body.to_agent,
      adapter: adapter.name,
      direction: "outbound",
    }),
  });

  // 6. Invoke adapter
  const task: DispatchTask = {
    task_id,
    context_id,
    from_agent,
    to_agent: body.to_agent,
    task_summary: scan.cleanContent,
    input: body.input,
    priority,
    dispatched_at,
  };
  const result = await adapter.dispatch(task);

  if (!result.accepted) {
    db.prepare(
      `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
       VALUES (@agent_id, 'error', @summary, @artifacts)`
    ).run({
      agent_id: from_agent,
      summary: result.detail,
      artifacts: JSON.stringify({ task_id, adapter: adapter.name }),
    });
    db.prepare(
      `UPDATE hive_delegations SET status='failed', result=@result, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE task_id=@task_id`
    ).run({ result: result.detail, task_id });
    return Response.json(
      {
        ok: false,
        error: result.detail,
        code: "ADAPTER_REJECTED",
        detail: result.evidence ?? {},
      },
      { status: 502 }
    );
  }

  return Response.json({
    ok: true,
    task_id,
    context_id,
    to_agent: body.to_agent,
    adapter: adapter.name,
    mode: result.mode,
    dispatched_at,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx vitest run src/app/api/dispatch/__tests__/route.test.ts 2>&1 | tail -15
```

Expected: PASS — 9 tests

- [ ] **Step 6: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen && git add src/app/api/dispatch/route.ts src/app/api/dispatch/__tests__/route.test.ts && git commit -m "feat(dispatch): POST /api/dispatch route + 9 E2E tests"
```

---

## Task 7: Extend `/api/hive` Route

**Files:**
- Modify: `src/app/api/hive/route.ts`
- Create: `src/app/api/hive/__tests__/lineage.test.ts`

Changes required:
1. Add `'canceled'` to `VALID_STATUSES`
2. Accept `result` field in the delegation upsert POST branch
3. Add `to_agent` alias for the `agent` GET param in delegation queries
4. Add `status` filter param to delegation GET
5. Add lineage GET branch: `task_id` and `context_id` query params

- [ ] **Step 1: Write lineage tests**

Create `src/app/api/hive/__tests__/lineage.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";

// Use real in-memory SQLite for lineage tests
const DB_MODULE = "@/lib/db";
vi.mock(DB_MODULE);

let testDb: Database.Database;

beforeEach(async () => {
  testDb = new Database(":memory:");
  const { initSchema } = await import("@/lib/db-schema");
  initSchema(testDb);
  const { getDb } = await import(DB_MODULE);
  vi.mocked(getDb).mockReturnValue(testDb as any);
  vi.resetModules(); // ensure route picks up fresh db mock
});

async function getRoute() {
  const { GET, POST } = await import("../route");
  return { GET, POST };
}

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/hive");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url, url: url.toString() } as any;
}

describe("GET /api/hive lineage", () => {
  it("returns delegation + action chain for task_id", async () => {
    const { GET, POST } = await getRoute();

    // Seed delegation
    await POST({
      json: async () => ({
        type: "delegation",
        task_id: "t1",
        from_agent: "kitchen",
        to_agent: "sophia",
        task_summary: "lineage test task",
        priority: 5,
        status: "pending",
      }),
    } as any);

    // Seed two actions with task_id in artifacts
    testDb
      .prepare(
        `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
         VALUES ('sophia', 'checkpoint', 'step 1', '{"task_id":"t1","progress":0.5}')`
      )
      .run();
    testDb
      .prepare(
        `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
         VALUES ('sophia', 'stop', 'done', '{"task_id":"t1","outcome":"completed"}')`
      )
      .run();

    const res = await GET(makeRequest({ task_id: "t1" }));
    const body = await res.json();

    expect(body.task_id).toBe("t1");
    expect(body.delegation).toBeTruthy();
    expect(body.delegation.task_summary).toBe("lineage test task");
    expect(body.actions).toHaveLength(2);
    expect(body.actions[0].action_type).toBe("checkpoint");
    expect(body.actions[1].action_type).toBe("stop");
  });

  it("returns 404 shape when task_id not found", async () => {
    const { GET } = await getRoute();
    const res = await GET(makeRequest({ task_id: "nonexistent" }));
    const body = await res.json();
    expect(body.task_id).toBe("nonexistent");
    expect(body.delegation).toBeNull();
    expect(body.actions).toHaveLength(0);
  });

  it("accepted 'canceled' as a valid delegation status", async () => {
    const { POST } = await getRoute();
    await POST({
      json: async () => ({
        type: "delegation",
        task_id: "t2",
        from_agent: "kitchen",
        to_agent: "sophia",
        task_summary: "cancelable task",
        status: "pending",
      }),
    } as any);
    const res = await POST({
      json: async () => ({
        type: "delegation",
        task_id: "t2",
        from_agent: "kitchen",
        to_agent: "sophia",
        task_summary: "cancelable task",
        status: "canceled",
      }),
    } as any);
    expect(res.status).toBe(200);
  });

  it("stores result JSON when delegation is completed", async () => {
    const { POST } = await getRoute();
    await POST({
      json: async () => ({
        type: "delegation",
        task_id: "t3",
        from_agent: "kitchen",
        to_agent: "sophia",
        task_summary: "result test",
        status: "pending",
      }),
    } as any);
    await POST({
      json: async () => ({
        type: "delegation",
        task_id: "t3",
        from_agent: "kitchen",
        to_agent: "sophia",
        task_summary: "result test",
        status: "completed",
        result: { artifacts: [{ type: "markdown", url: "https://example.com" }] },
      }),
    } as any);
    const row = testDb
      .prepare("SELECT result FROM hive_delegations WHERE task_id='t3'")
      .get() as { result: string } | undefined;
    expect(row).toBeTruthy();
    expect(JSON.parse(row!.result)).toMatchObject({
      artifacts: [{ type: "markdown" }],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx vitest run src/app/api/hive/__tests__/lineage.test.ts 2>&1 | tail -20
```

Expected: FAIL — tests that exercise `task_id` GET and `canceled` status will fail on current route.

- [ ] **Step 3: Update the hive route**

In `src/app/api/hive/route.ts`, make the following changes:

**Change 1** — Add `canceled` to `VALID_STATUSES` (line 9):

```typescript
const VALID_STATUSES = ['pending', 'active', 'paused', 'completed', 'failed', 'canceled'] as const;
```

**Change 2** — In the GET handler, add `task_id` and `context_id` early-exit branches. Insert before the `if (type === 'delegation')` block (after line 25):

```typescript
  // Lineage: task_id or context_id takes precedence over all other params
  const taskId = url.searchParams.get('task_id') ?? '';
  const contextId = url.searchParams.get('context_id') ?? '';

  if (taskId) {
    const delegation = db
      .prepare(`SELECT * FROM hive_delegations WHERE task_id = ?`)
      .get(taskId) as Record<string, unknown> | undefined ?? null;
    const actions = db
      .prepare(
        `SELECT id, agent_id, action_type, summary, artifacts, timestamp
         FROM hive_actions
         WHERE json_extract(artifacts, '$.task_id') = ?
         ORDER BY timestamp ASC, id ASC`
      )
      .all(taskId) as Record<string, unknown>[];
    const parsedActions = actions.map((a) => ({
      ...a,
      artifacts: a.artifacts ? (() => { try { return JSON.parse(a.artifacts as string); } catch { return a.artifacts; } })() : null,
    }));
    return Response.json({
      task_id: taskId,
      context_id: (delegation?.context_id as string) ?? null,
      delegation,
      actions: parsedActions,
      timestamp,
    });
  }

  if (contextId) {
    const delegations = db
      .prepare(`SELECT * FROM hive_delegations WHERE context_id = ? ORDER BY created_at ASC`)
      .all(contextId) as Record<string, unknown>[];
    const actions = db
      .prepare(
        `SELECT id, agent_id, action_type, summary, artifacts, timestamp
         FROM hive_actions
         WHERE json_extract(artifacts, '$.context_id') = ?
         ORDER BY timestamp ASC, id ASC`
      )
      .all(contextId) as Record<string, unknown>[];
    const parsedActions = actions.map((a) => ({
      ...a,
      artifacts: a.artifacts ? (() => { try { return JSON.parse(a.artifacts as string); } catch { return a.artifacts; } })() : null,
    }));
    return Response.json({ context_id: contextId, delegations, actions: parsedActions, timestamp });
  }
```

**Change 3** — In the delegation GET branch, add `to_agent` alias and `status` filter. Replace the `if (type === 'delegation')` block:

```typescript
  if (type === 'delegation') {
    const toAgent = url.searchParams.get('to_agent') ?? agent;
    const statusFilter = url.searchParams.get('status') ?? '';
    if (statusFilter && !(VALID_STATUSES as readonly string[]).includes(statusFilter)) {
      return Response.json(
        { error: `Invalid status filter: ${statusFilter}` },
        { status: 400 }
      );
    }
    let rows: unknown[];
    if (toAgent && statusFilter) {
      rows = db
        .prepare(
          `SELECT * FROM hive_delegations WHERE to_agent = ? AND status = ?
           ORDER BY priority ASC, created_at ASC LIMIT ?`
        )
        .all(toAgent, statusFilter, limit);
    } else if (toAgent) {
      rows = db
        .prepare(
          `SELECT * FROM hive_delegations WHERE to_agent = ? ORDER BY created_at DESC LIMIT ?`
        )
        .all(toAgent, limit);
    } else if (statusFilter) {
      rows = db
        .prepare(
          `SELECT * FROM hive_delegations WHERE status = ?
           ORDER BY priority ASC, created_at ASC LIMIT ?`
        )
        .all(statusFilter, limit);
    } else {
      rows = db
        .prepare(`SELECT * FROM hive_delegations ORDER BY created_at DESC LIMIT ?`)
        .all(limit);
    }
    return Response.json({ delegations: rows, timestamp });
  }
```

**Change 4** — In the POST delegation branch, accept `result`. Replace the `.run(...)` call in the delegation branch with:

```typescript
    db.prepare(
      `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, checkpoint, context_id, result)
       VALUES (@task_id, @from_agent, @to_agent, @task_summary, @priority, @status, @checkpoint, @context_id, @result)
       ON CONFLICT(task_id) DO UPDATE SET
         status     = excluded.status,
         checkpoint = excluded.checkpoint,
         context_id = COALESCE(excluded.context_id, context_id),
         result     = COALESCE(excluded.result, result),
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`
    ).run({
      task_id: body.task_id,
      from_agent: body.from_agent,
      to_agent: body.to_agent,
      task_summary: delegationScan.cleanContent,
      priority: body.priority ?? 5,
      status: body.status ?? 'pending',
      checkpoint: body.checkpoint ? JSON.stringify(body.checkpoint) : null,
      context_id: body.context_id ?? null,
      result: body.result ? JSON.stringify(body.result) : null,
    });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx vitest run src/app/api/hive/__tests__/lineage.test.ts 2>&1 | tail -15
```

Expected: PASS — 4 tests

- [ ] **Step 5: Run all hive tests to ensure no regressions**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx vitest run src/app/api/hive/ 2>&1 | tail -15
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/lcalderon/github/agent-kitchen && git add src/app/api/hive/route.ts src/app/api/hive/__tests__/lineage.test.ts && git commit -m "feat(dispatch): extend /api/hive — canceled status, result field, lineage GET"
```

---

## Task 8: Install `~/.hive/poll.sh`

**Files:**
- Install: `~/.hive/poll.sh` (not in repo)

- [ ] **Step 1: Write the script to disk**

```bash
cat > ~/.hive/poll.sh << 'SCRIPT'
#!/bin/bash
# poll.sh — poll the hive for a pending task for one agent
set -eu
AGENT_ID="${1:-}"
shift || true
[ -z "$AGENT_ID" ] && { echo "Usage: poll.sh <agent_id> [--once] [--interval N] [--status S] [--limit N]" >&2; exit 64; }

ONCE=0; INTERVAL=2; STATUS="pending"; LIMIT=1
while [ $# -gt 0 ]; do
  case "$1" in
    --once)      ONCE=1; shift ;;
    --interval)  INTERVAL="$2"; shift 2 ;;
    --status)    STATUS="$2"; shift 2 ;;
    --limit)     LIMIT="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 64 ;;
  esac
done

HIVE_URL="${HIVE_URL:-https://kitchen.epiloguecapital.com/api/hive}"
HIVE_TIMEOUT="${HIVE_TIMEOUT:-5}"
URL="${HIVE_URL}?type=delegation&to_agent=${AGENT_ID}&status=${STATUS}&limit=${LIMIT}"

poll_once() {
  local body
  body="$(curl -s --max-time "$HIVE_TIMEOUT" "$URL")" || { echo "ERR: curl failed" >&2; return 2; }
  python3 -c "
import json,sys
d=json.loads(sys.stdin.read() or '{}')
rows=d.get('delegations',[])
sys.exit(1) if not rows else print(json.dumps(rows[0]))
" <<< "$body"
}

if [ "$ONCE" -eq 1 ]; then poll_once; exit $?; fi
while true; do
  out="$(poll_once)" && { echo "$out"; exit 0; } || true
  sleep "$INTERVAL"
done
SCRIPT
chmod 755 ~/.hive/poll.sh
```

- [ ] **Step 2: Verify the script works in --once mode**

```bash
HIVE_URL=http://localhost:3002/api/hive ~/.hive/poll.sh sophia --once; echo "exit: $?"
```

Expected: exits 1 (no pending tasks) or prints a JSON task if one exists. No crash.

- [ ] **Step 3: Smoke test — dispatch to sophia, then poll**

```bash
# Dispatch a task
curl -s -X POST http://localhost:3002/api/dispatch \
  -H "Content-Type: application/json" \
  -d '{"to_agent":"sophia","task_summary":"smoke test task from plan 01","priority":5}' | python3 -m json.tool

# Poll for it
HIVE_URL=http://localhost:3002/api/hive ~/.hive/poll.sh sophia --once
```

Expected: dispatch returns `{"ok":true,"task_id":"...","adapter":"hive-poll","mode":"queued"}`. Poll returns the row.

- [ ] **Step 4: Smoke test — dispatch to alba, verify file in queue dir**

```bash
curl -s -X POST http://localhost:3002/api/dispatch \
  -H "Content-Type: application/json" \
  -d '{"to_agent":"alba","task_summary":"openclaw smoke test","priority":3}' | python3 -m json.tool

ls -la ~/.openclaw/delivery-queue/ 2>/dev/null || echo "(queue dir empty or missing — alba is opencode platform)"
```

Expected: dispatch returns `{"ok":true,"adapter":"openclaw","mode":"pushed"}`. A `<task_id>.json` file appears in `~/.openclaw/delivery-queue/`.

---

## Task 9: Full Test Suite + Build Verification

**Files:** None new — verify everything

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx vitest run 2>&1 | tail -30
```

Expected: all tests pass. Zero failures.

- [ ] **Step 2: Run TypeScript type check**

```bash
cd /Users/lcalderon/github/agent-kitchen && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Run production build**

```bash
cd /Users/lcalderon/github/agent-kitchen && npm run build 2>&1 | tail -20
```

Expected: build succeeds, no TS or lint errors.

- [ ] **Step 4: Run gitnexus detect-changes pre-commit check**

Per CLAUDE.md requirements — run before final commit:

```bash
cd /Users/lcalderon/github/agent-kitchen && npx gitnexus detect_changes 2>&1 | head -40
```

Review output. Confirm changes match: `db-schema.ts`, `hive/route.ts`, new `dispatch/` files only.

- [ ] **Step 5: Final commit if any stragglers**

```bash
cd /Users/lcalderon/github/agent-kitchen && git status
# Stage any unstaged changes and commit
git add -p  # review carefully
git commit -m "feat(dispatch): plan 01 complete — full test suite green"
```

---

## Exit Criteria Checklist

- [ ] `npm test` green — zero failures
- [ ] `npm run build` green — zero TS errors
- [ ] Manual smoke: `POST /api/dispatch` with `to_agent=alba` produces file in `~/.openclaw/delivery-queue/`
- [ ] Manual smoke: `POST /api/dispatch` with `to_agent=sophia` → `poll.sh sophia --once` returns the row
- [ ] DB migration is idempotent: fresh DB and existing DB both end up with `hive_delegations_v2_migrated=1`
- [ ] `GET /api/hive?task_id=X` returns `{delegation, actions[]}` lineage shape
- [ ] `PATCH` delegation to `status=canceled` returns 200

---

**Plan 02** (DispatchPanel UI + Agent Card endpoints) follows after all exit criteria above are met.

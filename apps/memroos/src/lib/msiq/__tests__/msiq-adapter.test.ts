// @vitest-environment node
/**
 * VAL-ORCH-001..005: self-hosted MSIQ adapter through MCP.
 *   - session establish without Foundry credentials
 *   - foundry-only mode fails closed without fallback
 *   - MCP protocol/capability validation precedes access
 *   - complete scope identity is enforced
 *   - writes are idempotent and provenance-preserving
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

async function loadModules() {
  const TEST_DB_DIR = path.join(os.tmpdir(), "msiq-adapter-" + crypto.randomUUID());
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.SQLITE_DB_PATH = path.join(TEST_DB_DIR, "msiq.db");
  const { getDb, closeDb } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);
  return { getDb, closeDb, db, TEST_DB_DIR };
}

let db: import("better-sqlite3").Database;
let closeDb: () => void;
let TEST_DB_DIR: string;

beforeEach(async () => {
  vi.resetModules();
  const m = await loadModules();
  db = m.db;
  closeDb = m.closeDb;
  TEST_DB_DIR = m.TEST_DB_DIR;
  if (fs.existsSync(TEST_DB_DIR)) {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  }
});

afterEach(() => {
  closeDb();
  if (fs.existsSync(TEST_DB_DIR)) {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  }
});

async function loadAdapter() {
  return await import("../msiq-adapter");
}

function makeActor() {
  return { id: "user-1", role: "agent", capability: "agent-1", tenantId: "default-tenant" };
}

function makeLabel() {
  return { visibility: "internal", policy: "agent_visible", domain: null, sensitivity: null };
}

describe("VAL-ORCH-001 -- openMsiqSession (self-hosted)", () => {
  it("opens a self-hosted session with negotiated MCP protocol + tools, no Foundry credentials needed", async () => {
    const { openMsiqSession } = await loadAdapter();
    const r = openMsiqSession(db, {
      tenantId: "default-tenant",
      actor: makeActor(),
      spaceId: "space-1",
      label: makeLabel(),
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
    });
    expect(r.kind).toBe("opened");
    if (r.kind !== "opened") return;
    expect(r.sessionToken).toMatch(/^msst-/);
    expect(r.protocolVersion).toMatch(/^202[0-9]-/);
    expect(r.tools.map((t) => t.name)).toContain("memory_write");
    expect(r.capabilities.map((c) => c.name)).toContain("memory.write");
    const row = db.prepare("SELECT foundry_blocked FROM msiq_adapter_sessions WHERE id = ?").get(r.sessionId) as { foundry_blocked: number };
    expect(row.foundry_blocked).toBe(1);
  });

  it("persists session + transcript hash in msiq_adapter_sessions", async () => {
    const { openMsiqSession } = await loadAdapter();
    const r = openMsiqSession(db, {
      tenantId: "default-tenant",
      actor: makeActor(),
      spaceId: "space-1",
      label: makeLabel(),
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
    });
    if (r.kind !== "opened") throw new Error("session failed");
    const row = db.prepare("SELECT id, scope_hash, tool_manifest_json, capability_flags_json, discovery_transcript FROM msiq_adapter_sessions WHERE id = ?").get(r.sessionId) as Record<string, unknown>;
    expect(row.id).toBe(r.sessionId);
    expect(row.scope_hash).toBe(r.scopeHash);
    expect(JSON.parse(String(row.tool_manifest_json)).length).toBe(r.tools.length);
    expect(JSON.parse(String(row.discovery_transcript)).length).toBeGreaterThanOrEqual(2);
  });
});

describe("VAL-ORCH-002 -- foundry-only mode fails closed", () => {
  it("returns typed unavailable and does not open a session", async () => {
    const { openMsiqSession } = await loadAdapter();
    const r = openMsiqSession(db, {
      tenantId: "default-tenant",
      actor: makeActor(),
      spaceId: "space-1",
      label: makeLabel(),
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
      foundryOnlyMode: true,
    });
    expect(r.kind).toBe("foundry_only_unavailable");
    const count = db.prepare("SELECT COUNT(*) AS n FROM msiq_adapter_sessions WHERE foundry_only_mode = 1").get() as { n: number };
    expect(count.n).toBe(0);
    const audits = db.prepare("SELECT event_type FROM audit_entries WHERE event_type = ?").all("orch.msiq.adapter.session") as Array<{ event_type: string }>;
    expect(audits.length).toBeGreaterThan(0);
  });

  it("local MCP remains usable while foundry is blocked", async () => {
    const { openMsiqSession } = await loadAdapter();
    const local = openMsiqSession(db, {
      tenantId: "default-tenant",
      actor: makeActor(),
      spaceId: "space-1",
      label: makeLabel(),
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
    });
    expect(local.kind).toBe("opened");
    const foundry = openMsiqSession(db, {
      tenantId: "default-tenant",
      actor: makeActor(),
      spaceId: "space-1",
      label: makeLabel(),
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
      foundryOnlyMode: true,
    });
    expect(foundry.kind).toBe("foundry_only_unavailable");
  });
});

describe("VAL-ORCH-003 -- MCP validation precedes access (adapter integration)", () => {
  it("denies session when capability set is missing required entries", async () => {
    const { openMsiqSession } = await loadAdapter();
    const r = openMsiqSession(db, {
      tenantId: "default-tenant",
      actor: makeActor(),
      spaceId: "space-1",
      label: makeLabel(),
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
      capabilities: [{ name: "memory.read", version: "1", source: "x" }],
    });
    expect(r.kind).toBe("denied");
    if (r.kind !== "denied") return;
    expect(r.reason).toBe("mcp_validation_failed");
  });

  it("denies session for unsupported protocol version", async () => {
    const { openMsiqSession } = await loadAdapter();
    const r = openMsiqSession(db, {
      tenantId: "default-tenant",
      actor: makeActor(),
      spaceId: "space-1",
      label: makeLabel(),
      purpose: "memory_search",
      beliefStage: "silver_candidate_claim",
      protocolVersion: "1999-01-01" as unknown as "2024-11-05",
    });
    expect(r.kind).toBe("denied");
  });
});

describe("VAL-ORCH-004 -- scope identity enforced", () => {
  it("rejects write with missing spaceId", async () => {
    const { openMsiqSession, writeViaMsiqAdapter } = await loadAdapter();
    const session = openMsiqSession(db, {
      tenantId: "default-tenant",
      actor: makeActor(),
      spaceId: "space-1",
      label: makeLabel(),
      purpose: "memory-promotion",
      beliefStage: "silver_candidate_claim",
    });
    if (session.kind !== "opened") throw new Error("session failed");
    const r = writeViaMsiqAdapter(db, {
      sessionToken: session.sessionToken,
      idempotencyKey: "k-1",
      payload: { content: "hello" },
      scopeOverride: { spaceId: "" },
    });
    expect(r.kind).toBe("denied");
    if (r.kind !== "denied") return;
    expect(r.reason).toBe("incomplete_scope");
  });

  it("rejects write when scope identity does not match session", async () => {
    const { openMsiqSession, writeViaMsiqAdapter } = await loadAdapter();
    const session = openMsiqSession(db, {
      tenantId: "default-tenant",
      actor: makeActor(),
      spaceId: "space-1",
      label: makeLabel(),
      purpose: "memory-promotion",
      beliefStage: "silver_candidate_claim",
    });
    if (session.kind !== "opened") throw new Error("session failed");
    const r = writeViaMsiqAdapter(db, {
      sessionToken: session.sessionToken,
      idempotencyKey: "k-2",
      payload: { content: "hello" },
      scopeOverride: {
        tenantId: "other-tenant",
        userId: "user-1",
        agentId: "agent-1",
        spaceId: "space-1",
        label: makeLabel(),
        purpose: "memory-promotion",
        beliefStage: "silver_candidate_claim",
      },
    });
    expect(r.kind).toBe("denied");
    if (r.kind !== "denied") return;
    expect(r.reason).toBe("incomplete_scope");
  });
});

describe("VAL-ORCH-005 -- idempotent adapter writes", () => {
  it("same idempotency_key + same payload resolves to one canonical id", async () => {
    const { openMsiqSession, writeViaMsiqAdapter } = await loadAdapter();
    const session = openMsiqSession(db, {
      tenantId: "default-tenant",
      actor: makeActor(),
      spaceId: "space-1",
      label: makeLabel(),
      purpose: "memory-promotion",
      beliefStage: "silver_candidate_claim",
    });
    if (session.kind !== "opened") throw new Error("session failed");
    const first = writeViaMsiqAdapter(db, {
      sessionToken: session.sessionToken,
      idempotencyKey: "k-replay",
      payload: { content: "hello world" },
    });
    expect(first.kind).toBe("applied");
    const second = writeViaMsiqAdapter(db, {
      sessionToken: session.sessionToken,
      idempotencyKey: "k-replay",
      payload: { content: "hello world" },
    });
    expect(second.kind).toBe("replayed");
    if (first.kind === "applied" && second.kind === "replayed") {
      expect(second.canonicalMemoryId).toBe(first.canonicalMemoryId);
      expect(second.replayCount).toBeGreaterThan(0);
    }
  });

  it("reusing idempotency_key with a different payload returns typed conflict", async () => {
    const { openMsiqSession, writeViaMsiqAdapter } = await loadAdapter();
    const session = openMsiqSession(db, {
      tenantId: "default-tenant",
      actor: makeActor(),
      spaceId: "space-1",
      label: makeLabel(),
      purpose: "memory-promotion",
      beliefStage: "silver_candidate_claim",
    });
    if (session.kind !== "opened") throw new Error("session failed");
    writeViaMsiqAdapter(db, {
      sessionToken: session.sessionToken,
      idempotencyKey: "k-conflict",
      payload: { content: "hello" },
    });
    const second = writeViaMsiqAdapter(db, {
      sessionToken: session.sessionToken,
      idempotencyKey: "k-conflict",
      payload: { content: "different" },
    });
    expect(second.kind).toBe("conflict");
    if (second.kind !== "conflict") return;
    expect(second.reason).toBe("payload_mismatch");
  });

  it("idempotency row records canonical_id + provenance_hash", async () => {
    const { openMsiqSession, writeViaMsiqAdapter } = await loadAdapter();
    const session = openMsiqSession(db, {
      tenantId: "default-tenant",
      actor: makeActor(),
      spaceId: "space-1",
      label: makeLabel(),
      purpose: "memory-promotion",
      beliefStage: "silver_candidate_claim",
    });
    if (session.kind !== "opened") throw new Error("session failed");
    const r = writeViaMsiqAdapter(db, {
      sessionToken: session.sessionToken,
      idempotencyKey: "k-prov",
      payload: { content: "provenance test" },
    });
    if (r.kind !== "applied") throw new Error("not applied");
    const row = db.prepare("SELECT canonical_memory_id, provenance_hash FROM msiq_adapter_idempotency WHERE idempotency_key = ?").get("k-prov") as { canonical_memory_id: string; provenance_hash: string };
    expect(row.canonical_memory_id).toBe(r.canonicalMemoryId);
    expect(row.provenance_hash.startsWith("sha256:")).toBe(true);
  });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DB_DIR = path.join(os.tmpdir(), `memory-add-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes.db");
const TEST_VAULT_ROOT = path.join(TEST_DB_DIR, "vault");

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  process.env.MEMROOS_VAULT_ROOT = TEST_VAULT_ROOT;
  process.env.MEM0_URL = "http://mem0.test";
  vi.resetModules();
  const registry = await import("@/lib/agent/registry");
  const route = await import("../add/route");
  const dbModule = await import("@/lib/db");
  return { ...registry, ...route, closeDb: dbModule.closeDb, getDb: dbModule.getDb };
}

describe("POST /api/memory/add", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, id: "mem-1" }))
    );
  });

  afterEach(async () => {
    const { closeDb } = await loadRoute();
    closeDb();
    vi.unstubAllGlobals();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    delete process.env.MEMROOS_VAULT_ROOT;
    delete process.env.MEM0_URL;
  });

  it("rejects missing, invalid, and body-only agent identity", async () => {
    const { POST, registerAgent } = await loadRoute();
    registerAgent({
      id: "memory-agent",
      name: "Memory Agent",
      role: "Writes memory",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const body = JSON.stringify({ agentId: "memory-agent", content: "remember this" });
    expect((await POST(new Request("http://localhost/api/memory/add", { method: "POST", body }))).status).toBe(401);
    expect(
      (
        await POST(
          new Request("http://localhost/api/memory/add", {
            method: "POST",
            headers: { authorization: "Bearer nope" },
            body,
          })
        )
      ).status
    ).toBe(401);
  });

  it("returns a fast durable bronze receipt and audits the write", async () => {
    const { POST, getDb, memoryWriteTimeoutMs, registerAgent } = await loadRoute();
    const { listEfficiencyEvents } = await import("@/lib/efficiency-telemetry");
    const { apiKey } = registerAgent({
      id: "memory-agent",
      name: "Memory Agent",
      role: "Writes memory",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const startedAt = performance.now();
    const res = await POST(
      new Request("http://localhost/api/memory/add", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ content: "remember this", type: "episodic", metadata: { source: "test" } }),
      })
    );
    const elapsedMs = performance.now() - startedAt;

    expect(res.status).toBe(200);
    expect(elapsedMs).toBeLessThan(1_000);
    expect(fetch).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      result: { status: "bronze_captured" },
      enrichment: { status: "pending" },
      saveQuality: { verdict: "accepted_with_coaching" },
    });
    const { readVaultArtifactForTenant } = await import("@/lib/memory/vault-durability");
    const artifact = readVaultArtifactForTenant(getDb(), "default-tenant", body.bronze.artifactId);
    expect(artifact.hashVerified).toBe(true);
    expect(
      getDb()
        .prepare("SELECT artifact_id, write_state, replay_state FROM memory_vault_durability WHERE id = ?")
        .get(body.bronze.durabilityId)
    ).toEqual({
      artifact_id: body.bronze.artifactId,
      write_state: "complete",
      replay_state: "complete",
    });
    expect(JSON.parse(artifact.body)).toMatchObject({
      schema: "memroos.governed_memory_bronze.v1",
      content: "remember this",
    });
    expect(memoryWriteTimeoutMs()).toBe(30_000);
    const rows = getDb().prepare("SELECT agent_id, memory_type FROM agent_memory_writes").all();
    expect(rows).toEqual([{ agent_id: "memory-agent", memory_type: "episodic" }]);
    const events = listEfficiencyEvents(getDb(), { eventType: "memory_write" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "memory_write",
      agentId: "memory-agent",
      payload: {
        source: "test",
        isRediscovery: false,
      },
    });
    expect(events[0].payload.dedupHash).toMatch(/^sha256:/);
    expect(events[0].payload.firstSeenAt).toBe(events[0].createdAt);
    const result = getDb().prepare("SELECT result FROM agent_memory_writes").get() as { result: string };
    expect(JSON.parse(result.result).saveQuality.score).toEqual(expect.any(Number));
  });

  it("redacts detected PII before forwarding memory writes to storage", async () => {
    const { POST, getDb, registerAgent } = await loadRoute();
    const { apiKey } = registerAgent({
      id: "privacy-agent",
      name: "Privacy Agent",
      role: "Writes privacy-screened memory",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await POST(
      new Request("http://localhost/api/memory/add", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          content: "Follow up with Ada at ada@example.com about SSN 123-45-6789.",
          type: "episodic",
          metadata: { source: "test" },
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    const responseBody = await res.json();
    const { readVaultArtifactForTenant } = await import("@/lib/memory/vault-durability");
    const artifact = readVaultArtifactForTenant(getDb(), "default-tenant", responseBody.bronze.artifactId);
    const persisted = JSON.parse(artifact.body) as any;
    expect(persisted.content).toBe("Follow up with Ada at [REDACTED:EMAIL_ADDRESS] about SSN [REDACTED:SSN_US].");
    expect(persisted.content).not.toContain("ada@example.com");
    expect(persisted.content).not.toContain("123-45-6789");
    expect(persisted.storagePayload.metadata.pii).toMatchObject({
      protected: true,
      provider: "presidio-compatible-local",
      entityTypes: ["EMAIL_ADDRESS", "SSN_US"],
      findingCount: 2,
    });
  });

  it("allows the memory write timeout to be tuned for slow local embedders", async () => {
    process.env.MEMROOS_MEMORY_WRITE_TIMEOUT_MS = "45000";
    const { memoryWriteTimeoutMs } = await loadRoute();

    expect(memoryWriteTimeoutMs()).toBe(45_000);

    delete process.env.MEMROOS_MEMORY_WRITE_TIMEOUT_MS;
  });

  it("keeps bronze durable when the async enrichment backend is unreachable", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("connection refused"));
    const { POST, getDb, registerAgent } = await loadRoute();
    const { runMemoryEnrichmentWorker } = await import("@/lib/memory/save-enrichment");
    const { apiKey } = registerAgent({
      id: "memory-agent",
      name: "Memory Agent",
      role: "Writes memory",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await POST(
      new Request("http://localhost/api/memory/add", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ content: "remember this", type: "episodic" }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect((await runMemoryEnrichmentWorker({ db: getDb(), maxBatch: 1 })).retried).toBe(1);
    const rows = getDb().prepare("SELECT agent_id FROM agent_memory_writes").all();
    expect(rows).toEqual([{ agent_id: "memory-agent" }]);
    const { readVaultArtifactForTenant } = await import("@/lib/memory/vault-durability");
    expect(readVaultArtifactForTenant(getDb(), "default-tenant", body.bronze.artifactId).hashVerified).toBe(true);
  });

  it("restarts the worker from the durable capture queue without losing the item", async () => {
    const { POST, registerAgent, closeDb } = await loadRoute();
    const { apiKey } = registerAgent({
      id: "restart-agent",
      name: "Restart Agent",
      role: "Writes memory",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    const res = await POST(
      new Request("http://localhost/api/memory/add", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ content: "The restart test outcome passed in project SAVEQ.", type: "episodic", metadata: { source: "test", derivedFrom: "fixture" } }),
      })
    );
    expect(res.status).toBe(200);
    closeDb();
    const restarted = await loadRoute();
    const { runMemoryEnrichmentWorker } = await import("@/lib/memory/save-enrichment");
    const summary = await runMemoryEnrichmentWorker({ db: restarted.getDb(), maxBatch: 1 });
    expect(summary.completed).toBe(1);
    expect(restarted.getDb().prepare("SELECT COUNT(*) AS count FROM agent_memory_candidates").get()).toEqual({ count: 1 });
    expect(restarted.getDb().prepare("SELECT status FROM agent_session_captures WHERE runtime = 'governed-memory'").get()).toEqual({ status: "handoff_ready" });
  });

  it("denies memory writes to tiers outside the agent capability policy", async () => {
    const { POST, getDb, registerAgent } = await loadRoute();
    const { apiKey } = registerAgent({
      id: "episodic-agent",
      name: "Episodic Agent",
      role: "Writes episodic memory",
      platform: "codex",
      protocol: "rest",
      capabilities: [{ id: "memory:write:episodic", name: "Episodic Memory", description: "", tags: [] }],
      issueApiKey: true,
    });

    const res = await POST(
      new Request("http://localhost/api/memory/add", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ content: "Luis works with MemroOS", type: "graph" }),
      })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      ok: false,
      code: "POLICY_DENIED",
      error: "Agent is not allowed to write graph memory",
    });
    expect(fetch).not.toHaveBeenCalled();
    const writes = getDb().prepare("SELECT agent_id FROM agent_memory_writes").all();
    expect(writes).toEqual([]);
    const audit = getDb().prepare("SELECT * FROM audit_log WHERE action = 'policy_denied'").get() as any;
    expect(audit).toMatchObject({ actor: "episodic-agent", target: "memory_write", severity: "high" });
  });
});

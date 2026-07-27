// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DB_DIR = path.join(os.tmpdir(), `agent-registry-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "registry.db");

async function loadRegistry() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const dbModule = await import("../db");
  const registryModule = await import("../agent-registry");
  return { ...registryModule, closeDb: dbModule.closeDb, getDb: dbModule.getDb };
}

describe("agent registry service", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRegistry();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  });

  it("registers an agent with capabilities and returns a one-time API key", async () => {
    const { registerAgent, getDb } = await loadRegistry();

    const result = registerAgent({
      id: "rest-cook",
      name: "Rest Cook",
      role: "REST integration agent",
      platform: "codex",
      protocol: "rest",
      capabilities: [
        { id: "memory.write", name: "Memory Write", description: "Writes memory", tags: ["memory"] },
      ],
      issueApiKey: true,
    });

    expect(result.apiKey).toBeTruthy();
    expect(result.agent).toMatchObject({
      id: "rest-cook",
      name: "Rest Cook",
      role: "REST integration agent",
      platform: "codex",
      protocol: "rest",
      status: "dormant",
    });
    expect(result.agent.capabilities).toHaveLength(1);

    const db = getDb();
    const keyRows = db.prepare("SELECT key_hash FROM agent_api_keys").all() as { key_hash: string }[];
    expect(keyRows).toHaveLength(1);
    expect(keyRows[0].key_hash).not.toBe(result.apiKey);
  });

  it("lists public registered agents without plaintext API keys", async () => {
    const { listRegisteredAgents, registerAgent } = await loadRegistry();

    registerAgent({
      id: "public-agent",
      name: "Public Agent",
      role: "Visible in registry",
      platform: "claude",
      protocol: "rest",
      issueApiKey: true,
    });

    const agents = listRegisteredAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("public-agent");
    expect(JSON.stringify(agents)).not.toContain("apiKey");
  });

  it("authenticates generated keys and rejects invalid keys", async () => {
    const { authenticateAgentKey, registerAgent } = await loadRegistry();

    const { apiKey } = registerAgent({
      id: "auth-agent",
      name: "Auth Agent",
      role: "Authenticated reporter",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    expect(apiKey).toBeTruthy();
    const authenticated = authenticateAgentKey(apiKey!, "auth-agent");
    expect(authenticated?.id).toBe("auth-agent");
    expect(authenticateAgentKey("wrong-key", "auth-agent")).toBeNull();
    expect(authenticateAgentKey(apiKey!, "other-agent")).toBeNull();
  });

  it("records heartbeats against an existing agent", async () => {
    const { listRegisteredAgents, recordHeartbeat, registerAgent } = await loadRegistry();

    registerAgent({
      id: "heartbeat-agent",
      name: "Heartbeat Agent",
      role: "Reports liveness",
      platform: "opencode",
      protocol: "rest",
    });

    recordHeartbeat("heartbeat-agent", {
      status: "active",
      currentTask: "checking in",
      metadata: { pid: 1234 },
    });

    const [agent] = listRegisteredAgents();
    expect(agent.status).toBe("active");
    expect(agent.lastHeartbeat).toBeTruthy();
    expect(agent.currentTask).toBe("checking in");
    expect(agent.metadata).toMatchObject({ pid: 1234 });
  });

  it("emits memory write efficiency events and flags rediscovered content", async () => {
    const { getDb, recordMemoryWrite, registerAgent } = await loadRegistry();
    const { listEfficiencyEvents } = await import("../efficiency-telemetry");

    registerAgent({
      id: "memory-agent",
      name: "Memory Agent",
      role: "Writes memory",
      platform: "codex",
      protocol: "rest",
    });

    recordMemoryWrite("memory-agent", {
      type: "episodic",
      content: "Luis uses MemRoOS for governed memory.",
      metadata: { source: "agent-context", taskId: "memory-task-1" },
    });
    recordMemoryWrite("memory-agent", {
      type: "episodic",
      content: "Luis uses MemRoOS for governed memory.",
      metadata: { source: "agent-context", taskId: "memory-task-1" },
    });

    const events = listEfficiencyEvents(getDb(), {
      eventType: "memory_write",
      taskId: "memory-task-1",
      limit: 10,
    });

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      eventType: "memory_write",
      agentId: "memory-agent",
      payload: {
        source: "agent-context",
        isRediscovery: false,
      },
    });
    expect(events[1].payload.dedupHash).toMatch(/^sha256:/);
    expect(events[1].payload.firstSeenAt).toBe(events[1].createdAt);
    expect(events[0]).toMatchObject({
      eventType: "memory_write",
      agentId: "memory-agent",
      payload: {
        source: "agent-context",
        dedupHash: events[1].payload.dedupHash,
        firstSeenAt: events[1].payload.firstSeenAt,
        isRediscovery: true,
      },
    });
  });

  it("keeps distinct memory write dedup hashes as unique discoveries", async () => {
    const { getDb, recordMemoryWrite, registerAgent } = await loadRegistry();
    const { listEfficiencyEvents } = await import("../efficiency-telemetry");

    registerAgent({
      id: "memory-agent",
      name: "Memory Agent",
      role: "Writes memory",
      platform: "codex",
      protocol: "rest",
    });

    recordMemoryWrite("memory-agent", {
      type: "episodic",
      content: "First unique fact.",
      metadata: { source: "agent-context", taskId: "memory-task-2" },
    });
    recordMemoryWrite("memory-agent", {
      type: "episodic",
      content: "Second unique fact.",
      metadata: { source: "agent-context", taskId: "memory-task-2" },
    });

    const events = listEfficiencyEvents(getDb(), {
      eventType: "memory_write",
      taskId: "memory-task-2",
      limit: 10,
    });

    expect(events).toHaveLength(2);
    expect(events[0].payload.isRediscovery).toBe(false);
    expect(events[1].payload.isRediscovery).toBe(false);
    expect(events[0].payload.dedupHash).not.toBe(events[1].payload.dedupHash);
  });

  it("flags rediscovered memory writes across agents in the tenant stream", async () => {
    const { getDb, recordMemoryWrite, registerAgent } = await loadRegistry();
    const { listEfficiencyEvents } = await import("../efficiency-telemetry");

    registerAgent({
      id: "memory-agent-a",
      name: "Memory Agent A",
      role: "Writes memory",
      platform: "codex",
      protocol: "rest",
    });
    registerAgent({
      id: "memory-agent-b",
      name: "Memory Agent B",
      role: "Writes memory",
      platform: "qwen",
      protocol: "rest",
    });

    recordMemoryWrite("memory-agent-a", {
      type: "episodic",
      content: "Shared rediscovered fact.",
      metadata: { source: "agent-context", taskId: "memory-task-3" },
    });
    recordMemoryWrite("memory-agent-b", {
      type: "episodic",
      content: "Shared rediscovered fact.",
      metadata: { source: "agent-context", taskId: "memory-task-3" },
    });

    const events = listEfficiencyEvents(getDb(), {
      eventType: "memory_write",
      taskId: "memory-task-3",
      limit: 10,
    });

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      agentId: "memory-agent-a",
      payload: { isRediscovery: false },
    });
    expect(events[0]).toMatchObject({
      agentId: "memory-agent-b",
      payload: {
        dedupHash: events[1].payload.dedupHash,
        firstSeenAt: events[1].payload.firstSeenAt,
        isRediscovery: true,
      },
    });
  });

  it("deregisters agents by soft delete and revokes keys", async () => {
    const { authenticateAgentKey, deregisterAgent, listRegisteredAgents, registerAgent } =
      await loadRegistry();

    const { apiKey } = registerAgent({
      id: "retiring-agent",
      name: "Retiring Agent",
      role: "Will be deregistered",
      platform: "gemini",
      protocol: "rest",
      issueApiKey: true,
    });

    deregisterAgent("retiring-agent");

    expect(listRegisteredAgents()).toHaveLength(0);
    expect(listRegisteredAgents({ includeDeregistered: true })[0].deregisteredAt).toBeTruthy();
    expect(authenticateAgentKey(apiKey!, "retiring-agent")).toBeNull();
  });

  it("maps remote-capable registered agents to RemoteAgentConfig compatibility shape", async () => {
    const { getRemoteAgents, registerAgent } = await loadRegistry();

    registerAgent({
      id: "remote-agent",
      name: "Remote Agent",
      role: "Remote worker",
      platform: "claude",
      protocol: "rest",
      location: "tailscale",
      host: "agent.tailnet",
      port: 3100,
      healthEndpoint: "/health",
      capabilities: [
        { id: "dispatch", name: "Dispatch", description: "Accepts delegated tasks", tags: [] },
      ],
    });

    expect(getRemoteAgents()).toEqual([
      expect.objectContaining({
        id: "remote-agent",
        name: "Remote Agent",
        location: "tailscale",
        host: "agent.tailnet",
        port: 3100,
        healthEndpoint: "/health",
      }),
    ]);
  });

  it("authenticates bearer headers and records skill, tool, and source-read telemetry", async () => {
    const {
      authenticateAgentHeaders,
      createAgentApiKey,
      getDb,
      recordSkillReport,
      recordToolOutcome,
      registerAgent,
    } = await loadRegistry();
    const { listEfficiencyEvents } = await import("../efficiency-telemetry");

    registerAgent({
      id: "telemetry-agent",
      name: "Telemetry Agent",
      role: "Reports outcomes",
      platform: "codex",
      protocol: "rest",
    });
    const key = createAgentApiKey("telemetry-agent");
    const headers = new Headers({ authorization: `Bearer ${key}` });
    expect(authenticateAgentHeaders(headers, "telemetry-agent")?.id).toBe("telemetry-agent");

    recordSkillReport("telemetry-agent", { skillId: "memory.write", action: "invoke", metadata: { lane: "test" } });
    recordToolOutcome("telemetry-agent", {
      toolId: "read_file",
      outcome: "ok",
      metadata: { sourceId: "doc-1", sourceContent: "hello world", taskId: "task-1" },
    });

    const skillRows = getDb().prepare("SELECT skill_id FROM agent_skill_reports WHERE agent_id = ?").all("telemetry-agent") as Array<{ skill_id: string }>;
    expect(skillRows).toEqual([{ skill_id: "memory.write" }]);
    const sourceEvents = listEfficiencyEvents(getDb(), { eventType: "source_read", taskId: "task-1", limit: 5 });
    expect(sourceEvents[0]?.payload.sourceId).toBe("doc-1");
  });

  it("resolves cloudflare tunnel agents and polls remote health endpoints", async () => {
    const { getRemoteAgents, pollAllRemoteAgents, pollRemoteAgent, registerAgent } = await loadRegistry();

    registerAgent({
      id: "cloud-agent",
      name: "Cloud Agent",
      role: "HTTPS worker",
      platform: "claude",
      protocol: "a2a",
      location: "cloudflare",
      tunnelUrl: "https://agent.example.test",
      metadata: {
        a2a: { endpointUrl: "https://agent.example.test/v1" },
      },
      capabilities: [{ id: "dispatch", name: "Dispatch", description: "Tasks", tags: [] }],
    });

    expect(getRemoteAgents()[0]).toMatchObject({
      id: "cloud-agent",
      host: "agent.example.test",
      port: 443,
      tunnelUrl: "https://agent.example.test",
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const polled = await pollRemoteAgent(getRemoteAgents()[0]!);
    expect(polled.reachable).toBe(true);
    expect(polled.latencyMs).not.toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const all = await pollAllRemoteAgents();
    expect(all.some((entry) => entry.reachable === false)).toBe(true);
    vi.unstubAllGlobals();
  });

  it("rejects API keys for unknown or deregistered agents", async () => {
    const { createAgentApiKey, deregisterAgent, registerAgent } = await loadRegistry();

    registerAgent({
      id: "gone-agent",
      name: "Gone Agent",
      role: "Retired",
      platform: "codex",
      protocol: "rest",
    });
    deregisterAgent("gone-agent");
    expect(() => createAgentApiKey("gone-agent")).toThrow(/unknown or deregistered/);
    expect(() => createAgentApiKey("missing-agent")).toThrow(/unknown or deregistered/);
  });

  // MEMX-3 regression: recordMemoryWrite must fan-out to the matching tier adapter
  // so vector/graph tiers actually persist, not just the audit row.
  it("MEMX-3 pushes to the matching tier adapter when MEMROOS_MEMORY_WRITE_PUSH_ADAPTER=1", async () => {
    process.env.MEMROOS_MEMORY_WRITE_PUSH_ADAPTER = "1";
    const writeSpy = vi.fn(async () => {});
    const adapter = { tiers: ["vector"], write: writeSpy, search: vi.fn(), health: vi.fn() };

    // loadRegistry() calls vi.resetModules(), which swaps in a fresh instance
    // of every module including memory/registry — so the adapter must be
    // registered AFTER that reset, against the same module instance
    // recordMemoryWrite() will resolve getAdapters() through, not before it.
    const { recordMemoryWrite, registerAgent } = await loadRegistry();
    const registryMod = await import("../memory/registry");
    registryMod.registerAdapter(adapter as unknown as Parameters<typeof registryMod.registerAdapter>[0]);
    registerAgent({
      id: "memx-agent",
      name: "Memx Agent",
      role: "Writes memory",
      platform: "codex",
      protocol: "rest",
    });
    recordMemoryWrite("memx-agent", {
      type: "vector",
      content: "MEMX-3 fan-out probe",
      metadata: { source: "memx-3-test" },
    });

    // allow the microtask to flush the fire-and-forget promise
    await new Promise((r) => setImmediate(r));
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: "memx-agent", content: "MEMX-3 fan-out probe" }),
    );

    // cleanup: unregister so other tests in the suite see an empty registry
    registryMod.clearRegistry();
    delete process.env.MEMROOS_MEMORY_WRITE_PUSH_ADAPTER;
  });

  it("MEMX-3 does NOT push to adapter when env flag is off (default)", async () => {
    delete process.env.MEMROOS_MEMORY_WRITE_PUSH_ADAPTER;
    const writeSpy = vi.fn(async () => {});
    const adapter = { tiers: ["vector"], write: writeSpy, search: vi.fn(), health: vi.fn() };

    // Same module-reset ordering requirement as the test above: register
    // against the instance recordMemoryWrite() will actually resolve.
    // Without this the negative assertion below passes for the wrong
    // reason (adapter never visible) rather than because the env guard works.
    const { recordMemoryWrite, registerAgent } = await loadRegistry();
    const registryMod = await import("../memory/registry");
    registryMod.registerAdapter(adapter as unknown as Parameters<typeof registryMod.registerAdapter>[0]);
    registerAgent({
      id: "memx-agent",
      name: "Memx Agent",
      role: "Writes memory",
      platform: "codex",
      protocol: "rest",
    });
    recordMemoryWrite("memx-agent", {
      type: "vector",
      content: "should not push",
      metadata: {},
    });
    await new Promise((r) => setImmediate(r));
    expect(writeSpy).not.toHaveBeenCalled();

    registryMod.clearRegistry();
  });
});

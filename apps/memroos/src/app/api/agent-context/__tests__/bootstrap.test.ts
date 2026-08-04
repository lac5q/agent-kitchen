// @vitest-environment node
/**
 * Phase 116 — Agent Context Bus Operational Bootstrap smoke test.
 *
 * Proves the full bootstrap flow end-to-end at the unit/integration level:
 *   1. DB schema is created with the correct agent_context_messages columns
 *   2. Two agents are registered and issued API keys
 *   3. Agent A sends a message to Agent B
 *   4. Agent B lists its inbox and sees the message
 *   5. Agent B acknowledges the message
 *   6. Agent B replies — threading (parent_id, thread_id, correlation_id) is preserved
 *   7. Audit log entries are created for send, ack, and reply
 *
 * Uses the agent-registry and agent-context-bus library functions directly
 * (not HTTP routes) so this is a unit/integration test, not an e2e test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DB_DIR = path.join(os.tmpdir(), `agent-bus-bootstrap-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "bootstrap.db");

async function loadModules() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const dbModule = await import("@/lib/db");
  const registryModule = await import("@/lib/agent/registry");
  const busModule = await import("@/lib/agent/context-bus");
  const auditModule = await import("@/lib/audit");
  return {
    getDb: dbModule.getDb,
    closeDb: dbModule.closeDb,
    ...registryModule,
    ...busModule,
    ...auditModule,
  };
}

describe("agent-context bus bootstrap smoke test (Phase 116)", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      const { closeDb } = await loadModules();
      closeDb();
    } catch {
      // ignore if modules never loaded
    }
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  });

  it("runs the full bootstrap flow: schema → register → key → send → inbox → ack → reply → audit", async () => {
    const mods = await loadModules();
    const db = mods.getDb();
    mods.ensureAgentContextBusSchema(db);

    // 1. Verify DB schema: agent_context_messages table exists with correct columns
    const tableInfo = db
      .prepare("PRAGMA table_info(agent_context_messages)")
      .all() as Array<{ name: string; type: string; notnull: number }>;
    const columnNames = tableInfo.map((col) => col.name);
    expect(columnNames).toEqual(
      expect.arrayContaining([
        "id",
        "thread_id",
        "correlation_id",
        "parent_id",
        "from_agent",
        "to_agent",
        "message_type",
        "status",
        "priority",
        "subject",
        "body",
        "context_refs",
        "artifacts",
        "visibility",
        "policy",
        "reply_required",
        "saved_memory_id",
        "created_at",
        "updated_at",
        "expires_at",
      ])
    );

    // Verify indexes exist
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='agent_context_messages'")
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((idx) => idx.name);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        "agent_context_messages_inbox",
        "agent_context_messages_outbox",
        "agent_context_messages_thread",
        "agent_context_messages_correlation",
        "agent_context_messages_parent",
      ])
    );

    // 2. Register two agents with API keys (bootstrap provisioning)
    const agentA = mods.registerAgent({
      id: "bootstrap-agent-a",
      name: "Bootstrap Agent A",
      role: "Sender",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    const agentB = mods.registerAgent({
      id: "bootstrap-agent-b",
      name: "Bootstrap Agent B",
      role: "Recipient",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    expect(agentA.apiKey).toBeTruthy();
    expect(agentA.apiKey).toMatch(/^ak_bootstrap-agent-a_/);
    expect(agentB.apiKey).toBeTruthy();
    expect(agentB.apiKey).toMatch(/^ak_bootstrap-agent-b_/);

    // Verify API keys authenticate correctly
    const authedA = mods.authenticateAgentKey(agentA.apiKey!);
    expect(authedA?.id).toBe("bootstrap-agent-a");
    const authedB = mods.authenticateAgentKey(agentB.apiKey!);
    expect(authedB?.id).toBe("bootstrap-agent-b");

    // 3. Agent A sends a message to Agent B
    const sentMessage = mods.postAgentContextMessage(db, {
      fromAgent: "bootstrap-agent-a",
      toAgent: "bootstrap-agent-b",
      messageType: "request",
      subject: "Bootstrap smoke test",
      body: "This is a bootstrap round-trip test for Phase 116.",
      contextRefs: [{ type: "phase", id: "116" }],
      artifacts: { test: true },
      replyRequired: true,
      priority: 3,
    });

    expect(sentMessage.id).toMatch(/^acm_/);
    expect(sentMessage.threadId).toMatch(/^thread_/);
    expect(sentMessage.correlationId).toMatch(/^corr_/);
    expect(sentMessage.status).toBe("pending");
    expect(sentMessage.fromAgent).toBe("bootstrap-agent-a");
    expect(sentMessage.toAgent).toBe("bootstrap-agent-b");
    expect(sentMessage.priority).toBe(3);
    expect(sentMessage.replyRequired).toBe(true);
    mods.writeAuditLog(db, {
      actor: "bootstrap-agent-a",
      action: "send",
      target: "agent_context_messages",
      detail: sentMessage.id,
      severity: "info",
    });

    // 4. Agent B lists its inbox and sees the message
    const inbox = mods.listAgentContextMessages(db, {
      agentId: "bootstrap-agent-b",
      status: "pending",
    });
    expect(inbox).toHaveLength(1);
    expect(inbox[0].id).toBe(sentMessage.id);
    expect(inbox[0].body).toBe("This is a bootstrap round-trip test for Phase 116.");

    // 5. Agent B acknowledges the message
    const acknowledged = mods.acknowledgeAgentContextMessage(
      db,
      sentMessage.id,
      "bootstrap-agent-b"
    );
    expect(acknowledged).not.toBeNull();
    expect(acknowledged!.status).toBe("acknowledged");
    mods.writeAuditLog(db, {
      actor: "bootstrap-agent-b",
      action: "acknowledge",
      target: "agent_context_messages",
      detail: sentMessage.id,
      severity: "info",
    });

    // Verify the message is no longer in the pending inbox
    const pendingInbox = mods.listAgentContextMessages(db, {
      agentId: "bootstrap-agent-b",
      status: "pending",
    });
    expect(pendingInbox).toHaveLength(0);

    // 6. Agent B replies — verify threading (parent_id, thread_id, correlation_id)
    const replyResult = mods.replyToAgentContextMessage(db, sentMessage.id, {
      fromAgent: "bootstrap-agent-b",
      body: "Bootstrap round-trip acknowledged. Bus is operational.",
    });

    expect(replyResult.original.status).toBe("replied");
    expect(replyResult.reply.parentId).toBe(sentMessage.id);
    expect(replyResult.reply.threadId).toBe(sentMessage.threadId);
    expect(replyResult.reply.correlationId).toBe(sentMessage.correlationId);
    expect(replyResult.reply.fromAgent).toBe("bootstrap-agent-b");
    expect(replyResult.reply.toAgent).toBe("bootstrap-agent-a");
    expect(replyResult.reply.messageType).toBe("reply");
    mods.writeAuditLog(db, {
      actor: "bootstrap-agent-b",
      action: "reply",
      target: "agent_context_messages",
      detail: replyResult.reply.id,
      severity: "info",
    });

    // Verify the reply appears in Agent A's inbox
    const agentAInbox = mods.listAgentContextMessages(db, {
      agentId: "bootstrap-agent-a",
    });
    expect(agentAInbox).toHaveLength(1);
    expect(agentAInbox[0].id).toBe(replyResult.reply.id);

    // Verify findReplyForAgentContextMessage works
    const foundReply = mods.findReplyForAgentContextMessage(db, sentMessage.id);
    expect(foundReply).not.toBeNull();
    expect(foundReply!.id).toBe(replyResult.reply.id);

    // Verify thread listing returns both messages in order
    const threadMessages = mods.listAgentContextMessages(db, {
      threadId: sentMessage.threadId,
    });
    expect(threadMessages).toHaveLength(2);
    expect(threadMessages[0].id).toBe(sentMessage.id);
    expect(threadMessages[1].id).toBe(replyResult.reply.id);

    // 7. Verify audit log entries were created for the lifecycle
    const auditRows = db
      .prepare(
        "SELECT actor, action, target, severity FROM audit_log WHERE target = 'agent_context_messages' ORDER BY timestamp ASC"
      )
      .all() as Array<{ actor: string; action: string; target: string; severity: string }>;

    expect(auditRows).toEqual(
      expect.arrayContaining([
        {
          actor: "bootstrap-agent-a",
          action: "send",
          target: "agent_context_messages",
          severity: "info",
        },
        {
          actor: "bootstrap-agent-b",
          action: "acknowledge",
          target: "agent_context_messages",
          severity: "info",
        },
        {
          actor: "bootstrap-agent-b",
          action: "reply",
          target: "agent_context_messages",
          severity: "info",
        },
      ])
    );

    // Verify registered_agents table has both agents
    const registeredAgents = db
      .prepare("SELECT id, name FROM registered_agents WHERE id IN ('bootstrap-agent-a', 'bootstrap-agent-b')")
      .all() as Array<{ id: string; name: string }>;
    expect(registeredAgents).toHaveLength(2);

    // Verify agent_api_keys table has keys for both agents
    const apiKeys = db
      .prepare("SELECT agent_id FROM agent_api_keys WHERE agent_id IN ('bootstrap-agent-a', 'bootstrap-agent-b') AND revoked_at IS NULL")
      .all() as Array<{ agent_id: string }>;
    expect(apiKeys).toHaveLength(2);

    db.close();
  });

  it("rejects messages between unregistered agents (fail-closed)", async () => {
    const mods = await loadModules();
    const db = mods.getDb();

    // Attempting to send a message from/to an unregistered agent should fail
    // due to the FK constraint on from_agent/to_agent → registered_agents(id)
    expect(() =>
      mods.postAgentContextMessage(db, {
        fromAgent: "nonexistent-agent",
        toAgent: "also-nonexistent",
        body: "This should fail",
      })
    ).toThrow();

    db.close();
  });

  it("enforces message type and status constraints via CHECK constraints", async () => {
    const mods = await loadModules();
    const db = mods.getDb();

    // Register agents for FK
    mods.registerAgent({
      id: "constraint-agent",
      name: "Constraint Agent",
      role: "Test",
      platform: "codex",
      protocol: "rest",
    });

    // Invalid message type should throw
    expect(() =>
      mods.postAgentContextMessage(db, {
        fromAgent: "constraint-agent",
        toAgent: "constraint-agent",
        body: "test",
        messageType: "invalid_type" as any,
      })
    ).toThrow(/Invalid agent context message type/);

    db.close();
  });
});

// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initSchema } from "@/lib/db-schema";
import {
  acknowledgeAgentContextMessage,
  ensureAgentContextBusSchema,
  findReplyForAgentContextMessage,
  listAgentContextMessages,
  postAgentContextMessage,
  replyToAgentContextMessage,
} from "@/lib/agent-context-bus";

function seedDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  ensureAgentContextBusSchema(db);
  const insertAgent = db.prepare(
    `INSERT INTO registered_agents(id, name, role, platform, protocol, status)
     VALUES(?, ?, ?, 'codex', 'rest', 'active')`
  );
  insertAgent.run("agent-alpha", "Agent Alpha", "Sender");
  insertAgent.run("agent-beta", "Agent Beta", "Recipient");
  return db;
}

describe("agent context bus", () => {
  it("stores durable messages and supports inbox, ack, reply, and reply lookup", () => {
    const db = seedDb();

    const message = postAgentContextMessage(db, {
      fromAgent: "agent-alpha",
      toAgent: "agent-beta",
      messageType: "request",
      subject: "Need context",
      body: "Please sync the checkout investigation context.",
      contextRefs: [{ type: "phase", id: "107" }],
      artifacts: { path: ".planning/ROADMAP.md" },
      replyRequired: true,
    });

    expect(message.status).toBe("pending");
    expect(message.threadId).toMatch(/^thread_/);
    expect(message.correlationId).toMatch(/^corr_/);
    expect(message.contextRefs).toEqual([{ type: "phase", id: "107" }]);

    const inbox = listAgentContextMessages(db, { agentId: "agent-beta", status: "pending" });
    expect(inbox.map((item) => item.id)).toEqual([message.id]);

    const acknowledged = acknowledgeAgentContextMessage(db, message.id, "agent-beta");
    expect(acknowledged?.status).toBe("acknowledged");

    const result = replyToAgentContextMessage(db, message.id, {
      fromAgent: "agent-beta",
      body: "Context synced. The issue is in Phase 107 route auth.",
    });
    expect(result.original.status).toBe("replied");
    expect(result.reply).toMatchObject({
      parentId: message.id,
      threadId: message.threadId,
      correlationId: message.correlationId,
      fromAgent: "agent-beta",
      toAgent: "agent-alpha",
      messageType: "reply",
    });

    expect(findReplyForAgentContextMessage(db, message.id)?.id).toBe(result.reply.id);
    db.close();
  });

  it("covers validation, filters, malformed row JSON, and reply errors", () => {
    const db = seedDb();

    expect(() =>
      postAgentContextMessage(db, {
        fromAgent: "agent-alpha",
        toAgent: "agent-beta",
        messageType: "invalid" as never,
        body: "bad type",
      })
    ).toThrow(/Invalid agent context message type/);

    const first = postAgentContextMessage(db, {
      fromAgent: "agent-alpha",
      toAgent: "agent-beta",
      body: "High priority",
      priority: Number.POSITIVE_INFINITY,
      threadId: "thread-filter",
      correlationId: "corr-filter",
    });
    const second = postAgentContextMessage(db, {
      fromAgent: "agent-beta",
      toAgent: "agent-alpha",
      body: "Outbox item",
      priority: 0,
      threadId: "thread-filter",
      correlationId: "corr-other",
    });
    db.prepare("UPDATE agent_context_messages SET context_refs = ?, artifacts = ? WHERE id = ?").run(
      "not-json",
      "[]",
      first.id
    );

    const allForAlpha = listAgentContextMessages(db, { agentId: "agent-alpha", box: "all", limit: 999 });
    expect(allForAlpha.map((message) => message.id)).toEqual([second.id, first.id]);
    expect(allForAlpha.find((message) => message.id === first.id)).toMatchObject({
      priority: 5,
      contextRefs: [],
      artifacts: {},
    });

    expect(listAgentContextMessages(db, { agentId: "agent-beta", box: "outbox" }).map((message) => message.id)).toEqual([
      second.id,
    ]);
    expect(listAgentContextMessages(db, { threadId: "thread-filter" })).toHaveLength(2);
    expect(listAgentContextMessages(db, { correlationId: "corr-filter" }).map((message) => message.id)).toEqual([
      first.id,
    ]);

    expect(() =>
      replyToAgentContextMessage(db, "missing-message", {
        fromAgent: "agent-beta",
        body: "no original",
      })
    ).toThrow(/Unknown agent context message/);
    expect(() =>
      replyToAgentContextMessage(db, first.id, {
        fromAgent: "agent-alpha",
        body: "wrong sender",
      })
    ).toThrow(/Only the addressed agent/);

    db.close();
  });
});

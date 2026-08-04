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
} from "@/lib/agent/context-bus";

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
});

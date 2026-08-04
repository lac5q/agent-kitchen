// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";

let db: Database.Database;
vi.mock("@/lib/db", () => ({ getDb: () => db }));

const {
  agentOwnershipHistory,
  deleteAgent,
  transferAgentOwnership,
  registerAgent,
  getRegisteredAgent,
  listAllAgentsUnscoped,
} = await import("@/lib/agent/registry");

const base = { role: "agent", platform: "claude", protocol: "rest" } as const;

function addUser(id: string) {
  db.prepare("INSERT INTO users (id, email, display_name, password_hash) VALUES (?,?,?,?)").run(
    id, `${id}@cordant.ai`, id, "x"
  );
  db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?,?)").run(id, "operator");
}

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  addUser("eric");
  addUser("juan");
});

describe("ownership history", () => {
  it("records a claim when an unowned agent gains an owner", () => {
    db.prepare(
      "INSERT INTO registered_agents (id,name,role,platform,protocol) VALUES ('orphan','orphan','agent','claude','rest')"
    ).run();
    registerAgent({ ...base, id: "orphan", name: "orphan", ownerId: "eric" });

    const history = agentOwnershipHistory("orphan");
    expect(history[0]).toMatchObject({ event: "claimed", ownerEmail: "eric@cordant.ai" });
  });

  it("records both sides of a transfer", () => {
    registerAgent({ ...base, id: "a1", name: "a1", ownerId: "eric" });
    transferAgentOwnership("a1", "juan", "eric");

    const events = agentOwnershipHistory("a1").map((h) => `${h.event}:${h.ownerEmail}`);
    expect(events).toContain("released:eric@cordant.ai");
    expect(events).toContain("transferred:juan@cordant.ai");
  });

  /**
   * The reason this table exists: deleting the agent must not delete the answer
   * to "who was responsible for it?".
   */
  it("survives the agent being deleted", () => {
    registerAgent({ ...base, id: "a1", name: "a1", ownerId: "eric" });
    transferAgentOwnership("a1", "juan", "eric");

    expect(deleteAgent("a1", "juan")).toBe(true);
    expect(getRegisteredAgent("a1", { includeDeregistered: true })).toBeNull();
    expect(listAllAgentsUnscoped().map((a) => a.id)).not.toContain("a1");

    const history = agentOwnershipHistory("a1");
    expect(history.some((h) => h.event === "agent_deleted")).toBe(true);
    expect(history.map((h) => h.ownerEmail)).toContain("eric@cordant.ai");
    expect(history.map((h) => h.ownerEmail)).toContain("juan@cordant.ai");
  });

  it("notes that an agent was unowned at deletion", () => {
    db.prepare(
      "INSERT INTO registered_agents (id,name,role,platform,protocol) VALUES ('orphan','orphan','agent','claude','rest')"
    ).run();
    expect(deleteAgent("orphan", "eric")).toBe(true);
    expect(agentOwnershipHistory("orphan")[0]).toMatchObject({
      event: "agent_deleted",
      ownerEmail: null,
      note: "was unowned at deletion",
    });
  });

  /**
   * owner_id is ON DELETE SET NULL, so the denormalised email is the only thing
   * left once the person is gone — which is exactly the offboarding case.
   */
  it("keeps the owner's email after the user row is deleted", () => {
    registerAgent({ ...base, id: "a1", name: "a1", ownerId: "eric" });
    transferAgentOwnership("a1", "juan", "eric");
    db.pragma("foreign_keys = ON");
    db.prepare("DELETE FROM users WHERE id='eric'").run();

    expect(agentOwnershipHistory("a1").map((h) => h.ownerEmail)).toContain("eric@cordant.ai");
  });

  it("deleting an unknown agent reports not found", () => {
    expect(deleteAgent("nope", "eric")).toBe(false);
  });

  it("removes the agent's API keys", () => {
    registerAgent({ ...base, id: "a1", name: "a1", ownerId: "eric", issueApiKey: true });
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM agent_api_keys WHERE agent_id='a1'").get() as { n: number }).n
    ).toBeGreaterThan(0);

    deleteAgent("a1", "eric");
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM agent_api_keys WHERE agent_id='a1'").get() as { n: number }).n
    ).toBe(0);
  });
});

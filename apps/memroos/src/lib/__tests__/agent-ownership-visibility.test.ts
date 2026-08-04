// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";

let db: Database.Database;
vi.mock("@/lib/db", () => ({ getDb: () => db }));

const {
  listAgentsVisibleTo,
  listAllAgentsUnscoped,
  canViewAgent,
  canManageAgent,
  setAgentShared,
  transferAgentOwnership,
} = await import("@/lib/agent/registry");

type Role = "admin" | "operator" | "reviewer";

function addUser(id: string, role: Role) {
  db.prepare("INSERT INTO users (id, email, display_name, password_hash) VALUES (?,?,?,?)").run(
    id,
    `${id}@cordant.ai`,
    id,
    "x"
  );
  db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?,?)").run(id, role);
  return { userId: id, role };
}

function addAgent(id: string, ownerId: string | null, shared = false) {
  db.prepare(
    `INSERT INTO registered_agents (id, name, role, platform, protocol, owner_id, is_shared)
     VALUES (?,?,?,?,?,?,?)`
  ).run(id, id, "agent", "claude", "rest", ownerId, shared ? 1 : 0);
}

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});

describe("agent visibility — the Eric/Juan scenario", () => {
  /**
   * The situation this was built for: Eric and Juan both work at Cordant on the
   * same instance. Juan must not see Eric's agents.
   */
  beforeEach(() => {
    addUser("luis", "admin");
    addUser("eric", "admin");
    addUser("juan", "reviewer");
    addAgent("eric-claude-code", "eric");
    addAgent("juan-claude-code", "juan");
    addAgent("luis-dev-agent", "luis");
    addAgent("legacy-unowned", null);
  });

  it("Juan sees only his own agent", () => {
    const seen = listAgentsVisibleTo({ userId: "juan", role: "reviewer" }).map((a) => a.id);
    expect(seen).toEqual(["juan-claude-code"]);
  });

  it("Juan cannot see Eric's agent", () => {
    const juan = { userId: "juan", role: "reviewer" as const };
    expect(listAgentsVisibleTo(juan).map((a) => a.id)).not.toContain("eric-claude-code");
    expect(canViewAgent(juan, "eric-claude-code")).toBe(false);
  });

  it("admins see everything, including unowned", () => {
    const seen = listAgentsVisibleTo({ userId: "luis", role: "admin" }).map((a) => a.id);
    expect(seen).toContain("eric-claude-code");
    expect(seen).toContain("juan-claude-code");
    expect(seen).toContain("legacy-unowned");
    expect(seen).toHaveLength(4);
  });

  it("unowned agents are hidden from non-admins", () => {
    const seen = listAgentsVisibleTo({ userId: "juan", role: "reviewer" }).map((a) => a.id);
    expect(seen).not.toContain("legacy-unowned");
  });

  /**
   * The trap that made the original plan wrong: if team membership granted
   * visibility, two people on one team would see each other's agents and
   * "private" would quietly stop being true.
   */
  it("sharing a team does NOT grant visibility", () => {
    db.prepare("INSERT INTO spaces (id, tenant_id, name) VALUES ('spc','default-tenant','cordant')").run();
    for (const [m, t] of [
      ["eric", "human"],
      ["juan", "human"],
      ["eric-claude-code", "agent"],
    ] as const) {
      db.prepare(
        "INSERT INTO space_members (space_id, member_id, member_type) VALUES ('spc',?,?)"
      ).run(m, t);
    }
    const seen = listAgentsVisibleTo({ userId: "juan", role: "reviewer" }).map((a) => a.id);
    expect(seen).not.toContain("eric-claude-code");
  });

  it("operator sees no more than reviewer — visibility is scope, not rank", () => {
    addUser("op", "operator");
    addAgent("op-agent", "op");
    const asOperator = listAgentsVisibleTo({ userId: "op", role: "operator" }).map((a) => a.id);
    expect(asOperator).toEqual(["op-agent"]);
  });
});

describe("sharing", () => {
  beforeEach(() => {
    addUser("eric", "admin");
    addUser("juan", "reviewer");
    addAgent("shared-helper", "eric");
    addAgent("eric-private", "eric");
  });

  it("a shared agent becomes visible to everyone", () => {
    const juan = { userId: "juan", role: "reviewer" as const };
    expect(listAgentsVisibleTo(juan).map((a) => a.id)).toEqual([]);

    setAgentShared("shared-helper", true);

    expect(listAgentsVisibleTo(juan).map((a) => a.id)).toEqual(["shared-helper"]);
    expect(canViewAgent(juan, "eric-private")).toBe(false);
  });

  it("unsharing hides it again", () => {
    setAgentShared("shared-helper", true);
    setAgentShared("shared-helper", false);
    expect(canViewAgent({ userId: "juan", role: "reviewer" }, "shared-helper")).toBe(false);
  });

  it("seeing a shared agent does not confer the right to manage it", () => {
    setAgentShared("shared-helper", true);
    const juan = { userId: "juan", role: "reviewer" as const };
    expect(canViewAgent(juan, "shared-helper")).toBe(true);
    expect(canManageAgent(juan, "shared-helper")).toBe(false);
  });
});

describe("management and transfer", () => {
  beforeEach(() => {
    addUser("luis", "admin");
    addUser("eric", "admin");
    addUser("juan", "reviewer");
    addAgent("eric-agent", "eric");
  });

  it("the owner may manage their own agent", () => {
    expect(canManageAgent({ userId: "eric", role: "admin" }, "eric-agent")).toBe(true);
  });

  it("a non-owner non-admin may not", () => {
    expect(canManageAgent({ userId: "juan", role: "reviewer" }, "eric-agent")).toBe(false);
  });

  it("an admin may manage anyone's", () => {
    expect(canManageAgent({ userId: "luis", role: "admin" }, "eric-agent")).toBe(true);
  });

  it("transfer moves visibility with ownership", () => {
    const juan = { userId: "juan", role: "reviewer" as const };
    expect(canViewAgent(juan, "eric-agent")).toBe(false);

    transferAgentOwnership("eric-agent", "juan");

    expect(canViewAgent(juan, "eric-agent")).toBe(true);
    expect(listAgentsVisibleTo(juan).map((a) => a.id)).toEqual(["eric-agent"]);
    // Eric is admin so still sees it; a non-admin former owner would not.
    expect(canManageAgent({ userId: "juan", role: "reviewer" }, "eric-agent")).toBe(true);
  });

  it("deleting a user orphans their agents rather than destroying them", () => {
    db.pragma("foreign_keys = ON");
    db.prepare("DELETE FROM users WHERE id = 'eric'").run();

    const row = db.prepare("SELECT owner_id FROM registered_agents WHERE id='eric-agent'").get() as {
      owner_id: string | null;
    };
    expect(row.owner_id).toBeNull(); // ON DELETE SET NULL — recoverable by transfer
    expect(listAllAgentsUnscoped().map((a) => a.id)).toContain("eric-agent");
  });
});

describe("unscoped listing", () => {
  it("returns everything — it is for system paths, not user-facing lists", () => {
    addUser("eric", "admin");
    addAgent("a", "eric");
    addAgent("b", null);
    expect(listAllAgentsUnscoped().map((a) => a.id).sort()).toEqual(["a", "b"]);
  });
});

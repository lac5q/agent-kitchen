// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { createSpace } from "@/lib/space";
import { onboardUser } from "@/lib/identity/lifecycle";
import {
  buildDelegationChain,
  verifyDelegationChain,
  weakestLinkOutcome,
  type DelegationChain,
} from "@/lib/identity/delegation";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

function seedUserWithAgent(
  db: Database.Database,
  emailSuffix: string,
  capabilities: string[]
): { userId: string; agentId: string } {
  const space = createSpace(db, { tenantId: "default-tenant", name: `space-${emailSuffix}` });
  const receipt = onboardUser(db, {
    email: `${emailSuffix}@example.com`,
    displayName: emailSuffix,
    role: "operator",
    spaceIds: [space.id],
    agentKit: {
      name: `agent-${emailSuffix}`,
      capabilities: capabilities.map((id) => ({ id })),
    },
  });
  return { userId: receipt.userId, agentId: receipt.agentId };
}

function seedSubAgent(
  db: Database.Database,
  userId: string,
  agentId: string,
  subId: string,
  capabilities: string[]
): void {
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO registered_agents
       (id, name, role, platform, protocol, status, location, metadata, owner_id, created_at, updated_at)
     VALUES (?, ?, 'sub-agent', 'memroos', 'local', 'dormant', 'local',
             ?, ?, ?, ?)`
  ).run(subId, subId, JSON.stringify({ parent_agent_id: agentId }), userId, ts, ts);

  const insertCap = db.prepare(
    `INSERT INTO agent_capabilities (agent_id, capability_id, name, description, tags, created_at, updated_at)
     VALUES (?, ?, ?, '', '[]', ?, ?)`
  );
  for (const cap of capabilities) {
    insertCap.run(subId, cap, cap, ts, ts);
  }
}

describe("identity/delegation.ts (Phase 131 / TEAMSCALE-04)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  describe("buildDelegationChain", () => {
    it("constructs a user -> agent chain with capabilities", () => {
      const { userId, agentId } = seedUserWithAgent(db, "alice", ["memory.read", "search"]);

      const chain = buildDelegationChain(db, userId, agentId);
      expect(chain).not.toBeNull();
      expect(chain!.user).toEqual({ id: userId, role: "operator" });
      expect(chain!.agent).toEqual({ id: agentId, capabilities: ["memory.read", "search"] });
      expect(chain!.subAgent).toBeUndefined();
      expect(chain!.hops).toEqual([
        {
          fromId: userId,
          fromType: "user",
          toId: agentId,
          toType: "agent",
          capabilities: ["memory.read", "search"],
        },
      ]);
    });

    it("returns null when the agent is not owned by the user", () => {
      const a = seedUserWithAgent(db, "a", ["memory.read"]);
      const b = seedUserWithAgent(db, "b", ["search"]);

      // Asking for the chain from a.userId + b.agentId should fail.
      expect(buildDelegationChain(db, a.userId, b.agentId)).toBeNull();
    });

    it("returns null when the agent does not exist", () => {
      const { userId } = seedUserWithAgent(db, "ghost", ["memory.read"]);
      expect(buildDelegationChain(db, userId, "agt_missing")).toBeNull();
    });

    it("includes the sub-agent hop when subAgentId is provided and parent matches", () => {
      const { userId, agentId } = seedUserWithAgent(db, "carol", ["memory.read"]);
      seedSubAgent(db, userId, agentId, "agt_carol_sub", ["policy.evaluate"]);

      const chain = buildDelegationChain(db, userId, agentId, "agt_carol_sub");
      expect(chain).not.toBeNull();
      expect(chain!.subAgent).toEqual({
        id: "agt_carol_sub",
        capabilities: ["policy.evaluate"],
      });
      expect(chain!.hops).toHaveLength(2);
      expect(chain!.hops[1]).toEqual({
        fromId: agentId,
        fromType: "agent",
        toId: "agt_carol_sub",
        toType: "sub-agent",
        capabilities: ["policy.evaluate"],
      });
    });

    it("returns null when the sub-agent's parent_agent_id does not match", () => {
      const { userId, agentId } = seedUserWithAgent(db, "dave", ["memory.read"]);
      seedSubAgent(db, userId, agentId, "agt_dave_sub_orphan", ["search"]);
      // Re-parent the sub-agent to a different agent id.
      db.prepare(
        `UPDATE registered_agents SET metadata = ? WHERE id = ?`
      ).run(JSON.stringify({ parent_agent_id: "agt_somebodyelse" }), "agt_dave_sub_orphan");

      expect(buildDelegationChain(db, userId, agentId, "agt_dave_sub_orphan")).toBeNull();
    });
  });

  describe("verifyDelegationChain", () => {
    it("accepts a valid user -> agent chain", () => {
      const { userId, agentId } = seedUserWithAgent(db, "eve", ["memory.read"]);
      const chain = buildDelegationChain(db, userId, agentId);
      const result = verifyDelegationChain(chain!);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("rejects a chain with no hops", () => {
      const chain = {
        user: { id: "u1", role: "operator" },
        agent: { id: "a1", capabilities: ["x"] },
        hops: [],
      } as DelegationChain;
      expect(verifyDelegationChain(chain)).toEqual({
        valid: false,
        reason: "missing_hops",
      });
    });

    it("rejects a chain with an invalid first hop", () => {
      const chain: DelegationChain = {
        user: { id: "u1", role: "operator" },
        agent: { id: "a1", capabilities: ["x"] },
        hops: [
          {
            fromId: "u1",
            fromType: "user",
            toId: "wrong-agent",
            toType: "agent",
            capabilities: ["x"],
          },
        ],
      };
      expect(verifyDelegationChain(chain)).toEqual({
        valid: false,
        reason: "invalid_first_hop",
      });
    });

    it("rejects a chain with an empty capabilities list", () => {
      const chain: DelegationChain = {
        user: { id: "u1", role: "operator" },
        agent: { id: "a1", capabilities: [] },
        hops: [
          {
            fromId: "u1",
            fromType: "user",
            toId: "a1",
            toType: "agent",
            capabilities: [],
          },
        ],
      };
      expect(verifyDelegationChain(chain)).toEqual({
        valid: false,
        reason: "agent_has_no_capabilities",
      });
    });

    it("rejects a sub-agent chain whose sub-hop is missing", () => {
      const chain: DelegationChain = {
        user: { id: "u1", role: "operator" },
        agent: { id: "a1", capabilities: ["x"] },
        subAgent: { id: "s1", capabilities: ["y"] },
        hops: [
          {
            fromId: "u1",
            fromType: "user",
            toId: "a1",
            toType: "agent",
            capabilities: ["x"],
          },
        ],
      };
      expect(verifyDelegationChain(chain)).toEqual({
        valid: false,
        reason: "missing_subagent_hop",
      });
    });
  });

  describe("weakestLinkOutcome", () => {
    const twoHopChain: DelegationChain = {
      user: { id: "u1", role: "operator" },
      agent: { id: "a1", capabilities: ["x"] },
      subAgent: { id: "s1", capabilities: ["y"] },
      hops: [
        { fromId: "u1", fromType: "user", toId: "a1", toType: "agent", capabilities: ["x"] },
        { fromId: "a1", fromType: "agent", toId: "s1", toType: "sub-agent", capabilities: ["y"] },
      ],
    };

    it("returns allow when all hops allow", () => {
      expect(
        weakestLinkOutcome(twoHopChain, [
          { hopIndex: 0, outcome: "allow" },
          { hopIndex: 1, outcome: "allow" },
        ])
      ).toBe("allow");
    });

    it("returns deny if any hop denies", () => {
      expect(
        weakestLinkOutcome(twoHopChain, [
          { hopIndex: 0, outcome: "allow" },
          { hopIndex: 1, outcome: "deny" },
        ])
      ).toBe("deny");
      expect(
        weakestLinkOutcome(twoHopChain, [
          { hopIndex: 0, outcome: "deny" },
          { hopIndex: 1, outcome: "allow" },
        ])
      ).toBe("deny");
    });

    it("returns deny when fewer outcomes than hops are provided (fail-closed)", () => {
      expect(
        weakestLinkOutcome(twoHopChain, [{ hopIndex: 0, outcome: "allow" }])
      ).toBe("deny");
      expect(weakestLinkOutcome(twoHopChain, [])).toBe("deny");
    });

    it("returns deny when the chain has no hops", () => {
      expect(weakestLinkOutcome({ ...twoHopChain, hops: [] }, [])).toBe("deny");
    });
  });
});
// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { createSpace } from "@/lib/space";
import { onboardUser } from "@/lib/identity/lifecycle";
import {
  checkOwnerGate,
  grantPerUseApproval,
  grantStandingApproval,
  listOwnerGateApprovals,
  revokeOwnerGateApproval,
} from "@/lib/identity/owner-gate";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

function seedOwnerAndAgents(
  db: Database.Database,
  ownerSuffix: string,
  agentSuffixes: string[]
): {
  ownerId: string;
  agentIds: string[];
} {
  const space = createSpace(db, { tenantId: "default-tenant", name: `gate-${ownerSuffix}` });
  const owner = onboardUser(db, {
    email: `owner-${ownerSuffix}@example.com`,
    displayName: `Owner ${ownerSuffix}`,
    role: "operator",
    spaceIds: [space.id],
    agentKit: { name: `owner-agent-${ownerSuffix}` },
  });

  const agentIds: string[] = [];
  for (const suffix of agentSuffixes) {
    const ts = new Date().toISOString();
    const agentId = `agt_${suffix}`;
    db.prepare(
      `INSERT INTO registered_agents
         (id, name, role, platform, protocol, status, location, metadata, created_at, updated_at)
       VALUES (?, ?, 'agent', 'memroos', 'local', 'dormant', 'local', '{}', ?, ?)`
    ).run(agentId, `agent-${suffix}`, ts, ts);
    agentIds.push(agentId);
  }
  return { ownerId: owner.userId, agentIds };
}

describe("identity/owner-gate.ts (Phase 131 / TEAMSCALE-06)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  describe("standing approval", () => {
    it("allows any agent when standing approval is granted", () => {
      const { ownerId, agentIds } = seedOwnerAndAgents(db, "stand", ["a1", "a2"]);
      grantStandingApproval(db, {
        ownerId,
        assetType: "memory_entry",
        assetId: "mem_42",
      });

      const d1 = checkOwnerGate(db, {
        assetType: "memory_entry",
        assetId: "mem_42",
        requestingAgentId: agentIds[0],
        ownerId,
      });
      expect(d1.allowed).toBe(true);
      expect(d1.approvalMode).toBe("standing");
      expect(d1.reason).toBe("owner_gate_standing_approval");

      const d2 = checkOwnerGate(db, {
        assetType: "memory_entry",
        assetId: "mem_42",
        requestingAgentId: agentIds[1],
        ownerId,
      });
      expect(d2.allowed).toBe(true);
      expect(d2.approvalMode).toBe("standing");
    });

    it("is idempotent (re-grant does not duplicate rows)", () => {
      const { ownerId } = seedOwnerAndAgents(db, "idemp", ["a1"]);
      grantStandingApproval(db, {
        ownerId,
        assetType: "memory_entry",
        assetId: "mem_43",
      });
      grantStandingApproval(db, {
        ownerId,
        assetType: "memory_entry",
        assetId: "mem_43",
      });

      const rows = listOwnerGateApprovals(db, {
        ownerId,
        assetType: "memory_entry",
        assetId: "mem_43",
      });
      expect(rows).toHaveLength(1);
    });
  });

  describe("per-use approval", () => {
    it("allows only the specific agent", () => {
      const { ownerId, agentIds } = seedOwnerAndAgents(db, "peruse", ["a1", "a2"]);
      grantPerUseApproval(db, {
        ownerId,
        assetType: "skill",
        assetId: "skill_xyz",
        agentId: agentIds[0],
      });

      const allowed = checkOwnerGate(db, {
        assetType: "skill",
        assetId: "skill_xyz",
        requestingAgentId: agentIds[0],
        ownerId,
      });
      expect(allowed.allowed).toBe(true);
      expect(allowed.approvalMode).toBe("per-use");

      const denied = checkOwnerGate(db, {
        assetType: "skill",
        assetId: "skill_xyz",
        requestingAgentId: agentIds[1],
        ownerId,
      });
      expect(denied.allowed).toBe(false);
      expect(denied.approvalMode).toBe("none");
      expect(denied.reason).toBe("owner_gate_no_approval");
    });

    it("does not match a different asset with the same owner/agent", () => {
      const { ownerId, agentIds } = seedOwnerAndAgents(db, "scoped", ["a1"]);
      grantPerUseApproval(db, {
        ownerId,
        assetType: "skill",
        assetId: "skill_xyz",
        agentId: agentIds[0],
      });

      const denied = checkOwnerGate(db, {
        assetType: "skill",
        assetId: "skill_other",
        requestingAgentId: agentIds[0],
        ownerId,
      });
      expect(denied.allowed).toBe(false);
    });
  });

  describe("no approval", () => {
    it("denies and writes an audit row", () => {
      const { ownerId, agentIds } = seedOwnerAndAgents(db, "noop", ["a1"]);
      const decision = checkOwnerGate(db, {
        assetType: "memory_entry",
        assetId: "mem_deny",
        requestingAgentId: agentIds[0],
        ownerId,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.approvalMode).toBe("none");

      const auditCount = db
        .prepare(
          `SELECT COUNT(*) AS n FROM audit_entries
            WHERE event_type = 'admin.compliance_updated'
              AND reason = 'owner_gate_denied'`
        )
        .get() as { n: number };
      expect(auditCount.n).toBe(1);
    });

    it("validates every required checkOwnerGate input", () => {
      const { ownerId, agentIds } = seedOwnerAndAgents(db, "check-inputs", ["a1"]);
      expect(() =>
        checkOwnerGate(db, {
          assetType: "",
          assetId: "mem",
          requestingAgentId: agentIds[0],
          ownerId,
        })
      ).toThrow(/assetType and assetId/);
      expect(() =>
        checkOwnerGate(db, {
          assetType: "memory_entry",
          assetId: "mem",
          requestingAgentId: "",
          ownerId,
        })
      ).toThrow(/requestingAgentId/);
      expect(() =>
        checkOwnerGate(db, {
          assetType: "memory_entry",
          assetId: "mem",
          requestingAgentId: agentIds[0],
          ownerId: "",
        })
      ).toThrow(/ownerId/);
    });
  });

  describe("grant functions", () => {
    it("grant functions are no-ops when approval already exists", () => {
      const { ownerId, agentIds } = seedOwnerAndAgents(db, "noop-grant", ["a1"]);

      grantPerUseApproval(db, {
        ownerId,
        assetType: "skill",
        assetId: "skill_1",
        agentId: agentIds[0],
      });
      const before = (
        db
          .prepare(`SELECT COUNT(*) AS n FROM owner_gate_approvals`)
          .get() as { n: number }
      ).n;

      grantPerUseApproval(db, {
        ownerId,
        assetType: "skill",
        assetId: "skill_1",
        agentId: agentIds[0],
      });
      const after = (
        db
          .prepare(`SELECT COUNT(*) AS n FROM owner_gate_approvals`)
          .get() as { n: number }
      ).n;
      expect(before).toBe(after);
    });

    it("revoke deactivates a standing approval", () => {
      const { ownerId, agentIds } = seedOwnerAndAgents(db, "revoke", ["a1"]);
      grantStandingApproval(db, {
        ownerId,
        assetType: "memory_entry",
        assetId: "mem_rev",
      });

      const before = checkOwnerGate(db, {
        assetType: "memory_entry",
        assetId: "mem_rev",
        requestingAgentId: agentIds[0],
        ownerId,
      });
      expect(before.allowed).toBe(true);

      const changed = revokeOwnerGateApproval(db, {
        ownerId,
        assetType: "memory_entry",
        assetId: "mem_rev",
        approvalMode: "standing",
      });
      expect(changed).toBe(1);

      const after = checkOwnerGate(db, {
        assetType: "memory_entry",
        assetId: "mem_rev",
        requestingAgentId: agentIds[0],
        ownerId,
      });
      expect(after.allowed).toBe(false);
    });

    it("revoke can target standing null-agent and per-use agent rows separately", () => {
      const { ownerId, agentIds } = seedOwnerAndAgents(db, "revoke-targeted", ["a1", "a2"]);
      grantStandingApproval(db, {
        ownerId,
        assetType: "memory_entry",
        assetId: "mem_targeted",
      });
      grantPerUseApproval(db, {
        ownerId,
        assetType: "memory_entry",
        assetId: "mem_targeted",
        agentId: agentIds[0],
      });

      expect(
        revokeOwnerGateApproval(db, {
          ownerId,
          assetType: "memory_entry",
          assetId: "mem_targeted",
          approvalMode: "standing",
          agentId: null,
        })
      ).toBe(1);
      expect(
        listOwnerGateApprovals(db, {
          ownerId,
          assetType: "memory_entry",
          assetId: "mem_targeted",
        }).map((row) => row.agentId)
      ).toEqual([agentIds[0]]);

      expect(
        revokeOwnerGateApproval(db, {
          ownerId,
          assetType: "memory_entry",
          assetId: "mem_targeted",
          agentId: agentIds[0],
        })
      ).toBe(1);
      expect(
        listOwnerGateApprovals(db, {
          ownerId,
          assetType: "memory_entry",
          assetId: "mem_targeted",
        })
      ).toEqual([]);
    });

    it("validates required input fields", () => {
      expect(() =>
        grantStandingApproval(db, { ownerId: "", assetType: "x", assetId: "y" })
      ).toThrow(/ownerId/);
      expect(() =>
        grantPerUseApproval(db, {
          ownerId: "u",
          assetType: "x",
          assetId: "y",
          agentId: "",
        })
      ).toThrow(/agentId/);
    });
  });
});
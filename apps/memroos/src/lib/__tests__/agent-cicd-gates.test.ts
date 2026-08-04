// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAgentVersion, evaluateReleaseGates, promoteAgentVersion, rollbackAgentVersion, listAgentVersions } from "@/lib/agent/cicd-gates";
import { initSchema } from "@/lib/db-schema";

let db: Database.Database;

describe("agent CI/CD release gates", () => {
  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it("registers an immutable version, runs gates, promotes, and rolls back", () => {
    const agentId = "hermes";
    
    // 1. Create draft version
    const version = createAgentVersion(db, {
      agentId,
      version: "1.0.0",
      profile: "prod",
      modelRoute: { provider: "anthropic", model: "claude-3-opus" },
      systemInstructions: "You are Hermes.",
    });

    expect(version.id).toBeTruthy();
    expect(version.status).toBe("draft");
    expect(version.gatesStatus.passed).toBe(false);

    // 2. Evaluate gates
    const gates = evaluateReleaseGates(db, "default-tenant", agentId, "1.0.0");
    expect(gates.passed).toBe(true);

    // 3. Promote to active
    const promoted = promoteAgentVersion(db, "default-tenant", agentId, "1.0.0", "prod", "operator-luis");
    expect(promoted.status).toBe("active");
    expect(promoted.promotedBy).toBe("operator-luis");

    // 4. Create second version
    const version2 = createAgentVersion(db, {
      agentId,
      version: "1.1.0",
      profile: "prod",
      modelRoute: { provider: "anthropic", model: "claude-3.5-sonnet" },
      systemInstructions: "You are Hermes v1.1.",
    });

    promoteAgentVersion(db, "default-tenant", agentId, "1.1.0", "prod", "operator-luis");
    
    const versions = listAgentVersions(db, "default-tenant", agentId);
    expect(versions).toHaveLength(2);
    expect(versions[0].version).toBe("1.1.0");
    expect(versions[0].status).toBe("active");
    expect(versions[1].version).toBe("1.0.0");
    expect(versions[1].status).toBe("promoted"); // Deprecated active

    // 5. Rollback to 1.0.0
    const restored = rollbackAgentVersion(db, "default-tenant", agentId, "prod", "operator-luis");
    expect(restored.version).toBe("1.0.0");
    expect(restored.status).toBe("active");

    const rolled = db.prepare("SELECT status FROM agent_versions WHERE version = '1.1.0'").get() as { status: string };
    expect(rolled.status).toBe("rolled_back");
  });
});

// @vitest-environment node
/**
 * Phase 145 (FLEET-13..16) — Pre-execution policy gate for GSD adapter actions.
 *
 * Tests the thin POLGOV wrapper. The gate must delegate to `evaluatePolicy`
 * and never reimplement policy logic. We force deny/allow outcomes by
 * controlling the legacy-undeclared capability flag so `checkDispatchPolicy`
 * checks declared skills.
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { initSchema } from "@/lib/db-schema";
import * as policyEngine from "@/lib/policy/engine";

import {
  isGsdAdapterPolicyAllowed,
  runGsdAdapterPolicyGate,
  type GsdAdapterPolicyGateInput,
} from "../adapter-policy-gate";

const TEST_DB_DIR = path.join(os.tmpdir(), `adapter-policy-gate-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "gate.db");

describe("GSD adapter policy gate", () => {
  let db: Database.Database;
  let savedLegacyFlag: string | undefined;

  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    db = new Database(TEST_DB_PATH);
    initSchema(db);
    savedLegacyFlag = process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    if (savedLegacyFlag === undefined) {
      delete process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES;
    } else {
      process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES = savedLegacyFlag;
    }
  });

  const baseInput: GsdAdapterPolicyGateInput = {
    adapterId: "hermes",
    action: "create_task",
    actorAgentId: "agent-alpha",
  };

  it("allows an action when the target declares dispatch capability", () => {
    // Force the legacy-undeclared allowance ON so an empty skills list still
    // passes the dispatch capability check. This proves the gate delegates to
    // POLGOV and returns the underlying capability decision.
    process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES = "on";

    const evaluation = runGsdAdapterPolicyGate(db, baseInput);

    expect(isGsdAdapterPolicyAllowed(evaluation)).toBe(true);
    expect(evaluation.receipt.outcome).toBe("allow");
    expect(evaluation.receipt.domain).toBe("capability");
    expect(evaluation.receipt.action).toBe("create_task");
    expect(evaluation.receipt.actorId).toBe("agent-alpha");
    expect(evaluation.capability).toBeDefined();
    expect(evaluation.capability?.allowed).toBe(true);
  });

  it("denies an action when the target lacks dispatch capability", () => {
    // Force strict capability checking in the test environment so an empty
    // skills list triggers a MISSING_CAPABILITY deny.
    process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES = "off";

    const evaluation = runGsdAdapterPolicyGate(db, baseInput);

    expect(isGsdAdapterPolicyAllowed(evaluation)).toBe(false);
    expect(evaluation.receipt.outcome).toBe("deny");
    expect(evaluation.receipt.ruleMatched).toBe("capability.dispatch");
    expect(evaluation.capability?.allowed).toBe(false);
    expect(evaluation.capability?.code).toBe("MISSING_CAPABILITY");
  });

  it("writes a POLICY_DECISION audit row when a db is provided", () => {
    process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES = "off";

    const before = (db
      .prepare("SELECT COUNT(*) as c FROM audit_entries WHERE event_type = ?")
      .get(AUDIT_EVENT_TYPES.POLICY_DECISION) as { c: number }).c;

    runGsdAdapterPolicyGate(db, baseInput);

    const after = (db
      .prepare("SELECT COUNT(*) as c FROM audit_entries WHERE event_type = ?")
      .get(AUDIT_EVENT_TYPES.POLICY_DECISION) as { c: number }).c;

    expect(after - before).toBe(1);

    const row = db
      .prepare(
        "SELECT event_type, entity_type, actor_id, actor_role, entity_id, metadata_json FROM audit_entries WHERE event_type = ? ORDER BY rowid DESC LIMIT 1"
      )
      .get(AUDIT_EVENT_TYPES.POLICY_DECISION) as {
      event_type: string;
      entity_type: string;
      actor_id: string;
      actor_role: string;
      entity_id: string;
      metadata_json: string;
    };

    expect(row.event_type).toBe(AUDIT_EVENT_TYPES.POLICY_DECISION);
    expect(row.entity_type).toBe(ENTITY_TYPES.POLICY_DECISION);
    expect(row.entity_id).toBe("policy_decision:capability:create_task");
    expect(row.actor_id).toBe("agent-alpha");
    expect(row.actor_role).toBe("system");

    const metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
    expect(metadata.domain).toBe("capability");
    expect(metadata.action).toBe("create_task");
    expect(metadata.ruleMatched).toBe("capability.dispatch");
    expect(metadata.outcome).toBe("deny");
    expect(metadata.reason).toBeDefined();
  });

  it("does not leak raw payload content into the receipt detail", () => {
    process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES = "off";

    const evaluation = runGsdAdapterPolicyGate(db, baseInput);

    const detail = evaluation.receipt.detail ?? {};
    const detailJson = JSON.stringify(detail);
    expect(detailJson).not.toMatch(/secret/i);
    expect(detailJson).not.toMatch(/password/i);
    expect(detail).not.toHaveProperty("content");
    expect(detail).not.toHaveProperty("payload");
    expect(detail).not.toHaveProperty("body");
  });

  it("fails closed when evaluatePolicy throws", () => {
    const spy = vi.spyOn(policyEngine, "evaluatePolicy").mockImplementation(() => {
      throw new Error("policy engine unavailable");
    });

    try {
      const evaluation = runGsdAdapterPolicyGate(db, baseInput);

      expect(isGsdAdapterPolicyAllowed(evaluation)).toBe(false);
      expect(evaluation.receipt.outcome).toBe("deny");
      expect(evaluation.receipt.ruleMatched).toBe("gate.error");
      expect(evaluation.receipt.reason).toBe("policy engine unavailable");
      expect(evaluation.capability?.allowed).toBe(false);
      expect(evaluation.capability?.allowed).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("works without a db handle (no audit write, no crash)", () => {
    process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES = "on";

    const evaluation = runGsdAdapterPolicyGate(undefined, baseInput);

    expect(isGsdAdapterPolicyAllowed(evaluation)).toBe(true);
    expect(evaluation.receipt.policyVersion).not.toBe("unknown");
  });

  it("maps each GSD adapter id to a valid RemoteAgentConfig shape", () => {
    process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES = "on";
    const adapterIds: GsdAdapterPolicyGateInput["adapterId"][] = [
      "hermes",
      "discord",
      "telegram",
      "codex",
      "claude_code",
      "cursor",
    ];

    for (const adapterId of adapterIds) {
      const evaluation = runGsdAdapterPolicyGate(undefined, {
        ...baseInput,
        adapterId,
      });
      expect(evaluation.receipt.action).toBe(baseInput.action);
      expect(evaluation.receipt.domain).toBe("capability");
    }
  });
});

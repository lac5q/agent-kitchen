// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb } from "@/lib/db";
import { POST as expiryPost } from "../expiry/route";
import { POST as decayPost } from "../decay/route";
import { POST as consolidationPost } from "../consolidation/route";
import { GET as holdsGet, POST as holdsPost } from "../legal-holds/route";
import { GET as retentionGet, POST as retentionPost } from "../retention/route";
import { POST as subjectErasurePost } from "../subject-erasure/route";
import { GET as tombstonesGet, POST as tombstonesPost } from "../tombstones/route";

const TMP_ROOT = path.join(os.tmpdir(), `memory-lifecycle-route-${crypto.randomUUID()}`);

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3110/api/memory-lifecycle/retention", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  closeDb();
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  process.env["SQLITE_DB_PATH"] = path.join(TMP_ROOT, `${crypto.randomUUID()}.db`);
});

afterEach(() => {
  closeDb();
  delete process.env["SQLITE_DB_PATH"];
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("memory lifecycle API routes", () => {
  it("supports policy registration, legal hold skip, release, and later expiry", async () => {
    const policyResponse = await retentionPost(
      jsonRequest({
        action: "create_policy",
        id: "policy-route",
        name: "route policy",
        ontologyType: "memory.note",
        securityLabel: { visibility: "internal" },
        purpose: "recall",
        scope: { tenantId: "default-tenant", project: "alpha", purpose: "recall" },
        durationDays: 0,
        actorId: "operator",
      })
    );
    expect(policyResponse.status).toBe(200);

    const registerResponse = await retentionPost(
      jsonRequest({
        action: "register_record",
        recordType: "message",
        recordId: "api-msg-1",
        ontologyType: "memory.note",
        securityLabel: { visibility: "internal" },
        purpose: "recall",
        scope: { tenantId: "default-tenant", project: "alpha", purpose: "recall" },
        actorId: "operator",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
    );
    expect(registerResponse.status).toBe(200);

    const holdResponse = await holdsPost(
      jsonRequest({
        action: "create",
        id: "hold-route",
        scope: { tenantId: "default-tenant", recordId: "api-msg-1", purpose: "recall" },
        reasonCode: "litigation",
        actorId: "operator",
      })
    );
    expect(holdResponse.status).toBe(200);

    const heldRun = await expiryPost(
      jsonRequest({
        runKey: "route-run-held",
        actorId: "system",
        scope: { tenantId: "default-tenant", project: "alpha" },
        now: "2026-01-02T00:00:00.000Z",
      })
    );
    const heldJson = (await heldRun.json()) as { summary: { held: number; expired: number } };
    expect(heldJson.summary.held).toBe(1);
    expect(heldJson.summary.expired).toBe(0);

    const releaseResponse = await holdsPost(
      jsonRequest({
        action: "release",
        holdId: "hold-route",
        actorId: "operator",
        now: "2026-01-02T01:00:00.000Z",
      })
    );
    expect(releaseResponse.status).toBe(200);

    const expiredRun = await expiryPost(
      jsonRequest({
        runKey: "route-run-expired",
        actorId: "system",
        scope: { tenantId: "default-tenant", project: "alpha" },
        now: "2026-01-02T02:00:00.000Z",
      })
    );
    const expiredJson = (await expiredRun.json()) as { summary: { held: number; expired: number } };
    expect(expiredJson.summary.held).toBe(0);
    expect(expiredJson.summary.expired).toBe(1);
  });

  it("lists legal holds and supports scope updates plus validation errors", async () => {
    const createResponse = await holdsPost(
      jsonRequest({
        action: "create",
        id: "hold-list",
        scope: { tenantId: "default-tenant", recordId: "api-msg-list" },
        reasonCode: "audit",
        actorId: "operator",
      })
    );
    expect(createResponse.status).toBe(200);

    const listResponse = await holdsGet(
      new Request("http://localhost:3110/api/memory-lifecycle/legal-holds?tenantId=default-tenant")
    );
    const listJson = (await listResponse.json()) as { holds: Array<{ id: string }> };
    expect(listResponse.status).toBe(200);
    expect(listJson.holds.some((hold) => hold.id === "hold-list")).toBe(true);

    const updateResponse = await holdsPost(
      jsonRequest({
        action: "update_scope",
        holdId: "hold-list",
        scope: { tenantId: "default-tenant", recordId: "api-msg-list", project: "alpha" },
        actorId: "operator",
        reason: "expanded scope",
      })
    );
    expect(updateResponse.status).toBe(200);

    const unsupportedResponse = await holdsPost(
      jsonRequest({
        action: "archive",
        holdId: "hold-list",
        actorId: "operator",
      })
    );
    expect(unsupportedResponse.status).toBe(400);
    expect((await unsupportedResponse.json()).error).toMatch(/unsupported action/i);
  });

  it("evaluates retention policies and lists receipts via GET", async () => {
    await retentionPost(
      jsonRequest({
        action: "create_policy",
        id: "policy-eval",
        name: "eval policy",
        ontologyType: "memory.note",
        securityLabel: { visibility: "internal" },
        purpose: "recall",
        scope: { tenantId: "default-tenant", project: "beta" },
        durationDays: 30,
        actorId: "operator",
      })
    );

    const evaluateResponse = await retentionPost(
      jsonRequest({
        action: "evaluate",
        ontologyType: "memory.note",
        securityLabel: { visibility: "internal" },
        purpose: "recall",
        scope: { tenantId: "default-tenant", project: "beta" },
        createdAt: "2026-01-01T00:00:00.000Z",
        now: "2026-01-02T00:00:00.000Z",
      })
    );
    expect(evaluateResponse.status).toBe(200);

    const registerResponse = await retentionPost(
      jsonRequest({
        action: "register_record",
        recordType: "message",
        recordId: "receipt-msg-1",
        ontologyType: "memory.note",
        securityLabel: { visibility: "internal" },
        purpose: "recall",
        scope: { tenantId: "default-tenant", project: "beta" },
        actorId: "operator",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
    );
    expect(registerResponse.status).toBe(200);

    const receiptsResponse = await retentionGet(
      new Request("http://localhost:3110/api/memory-lifecycle/retention?recordId=receipt-msg-1")
    );
    const receiptsJson = (await receiptsResponse.json()) as { receipts: unknown[] };
    expect(receiptsResponse.status).toBe(200);
    expect(receiptsJson.receipts.length).toBeGreaterThan(0);

    const unsupportedResponse = await retentionPost(
      jsonRequest({
        action: "purge_all",
        actorId: "operator",
      })
    );
    expect(unsupportedResponse.status).toBe(400);
  });


  it("supports subject-erasure plan review, execution, and protected decay via API", async () => {
    const policyResponse = await retentionPost(
      jsonRequest({
        action: "create_policy",
        id: "policy-subject-route",
        name: "subject route policy",
        ontologyType: "memory.note",
        securityLabel: { visibility: "internal" },
        purpose: "recall",
        scope: { tenantId: "default-tenant", purpose: "recall", project: "alpha" },
        durationDays: 365,
        actorId: "operator",
      })
    );
    expect(policyResponse.status).toBe(200);

    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const messageId = db
      .prepare(
        `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
         VALUES(?,?,?,?,?,?,?,?)`
      )
      .run("route-subject-session", "alpha", "agent", "user", "ROUTE_SUBJECT_SECRET", "2026-01-01T00:00:00.000Z", "internal", "indexable")
      .lastInsertRowid as number;
    db.prepare("INSERT INTO memory_salience(message_id, tier, salience_score, last_decay_at) VALUES (?, 'mid', 1.0, ?)").run(
      messageId,
      "2026-01-01T00:00:00.000Z"
    );

    const registerResponse = await retentionPost(
      jsonRequest({
        action: "register_record",
        recordType: "message",
        recordId: String(messageId),
        ontologyType: "memory.note",
        securityLabel: { visibility: "internal" },
        purpose: "recall",
        scope: { tenantId: "default-tenant", purpose: "recall", project: "alpha", subjectId: "route-subject", decayProtected: true },
        actorId: "operator",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
    );
    expect(registerResponse.status).toBe(200);

    const decayResponse = await decayPost(
      jsonRequest({
        runKey: "route-decay-protected",
        actorId: "system",
        now: "2026-01-02T00:00:00.000Z",
        scope: { tenantId: "default-tenant", purpose: "recall", project: "alpha" },
      })
    );
    expect(decayResponse.status).toBe(200);
    const decayJson = (await decayResponse.json()) as { summary: { skippedProtected: number; decayed: number } };
    expect(decayJson.summary.skippedProtected).toBe(1);
    expect(decayJson.summary.decayed).toBe(0);

    const invalidDecayResponse = await decayPost(
      jsonRequest({
        actorId: "system",
        now: 123,
        scope: { tenantId: "default-tenant", purpose: "recall", project: "alpha" },
      })
    );
    expect(invalidDecayResponse.status).toBe(400);
    expect((await invalidDecayResponse.json()).error).toBe("now is required");

    const planResponse = await subjectErasurePost(
      jsonRequest({
        action: "create_plan",
        id: "route-subject-plan",
        subject: { subjectId: "route-subject" },
        scope: { tenantId: "default-tenant", purpose: "recall", project: "alpha" },
        actorId: "operator",
        now: "2026-01-02T00:05:00.000Z",
      })
    );
    expect(planResponse.status).toBe(200);
    const planJson = (await planResponse.json()) as { plan: { planHash: string; matchedRecords: Array<{ recordId: string }> } };
    expect(planJson.plan.matchedRecords).toHaveLength(1);

    const approveResponse = await subjectErasurePost(
      jsonRequest({
        action: "approve_plan",
        planId: "route-subject-plan",
        planHash: planJson.plan.planHash,
        actorId: "reviewer",
        now: "2026-01-02T00:10:00.000Z",
      })
    );
    expect(approveResponse.status).toBe(200);

    const executeResponse = await subjectErasurePost(
      jsonRequest({
        action: "execute_plan",
        planId: "route-subject-plan",
        planHash: planJson.plan.planHash,
        actorId: "operator",
        now: "2026-01-02T00:15:00.000Z",
      })
    );
    expect(executeResponse.status).toBe(200);
    const executeJson = (await executeResponse.json()) as { status: string; erased: number };
    expect(executeJson).toMatchObject({ status: "completed", erased: 1 });
    expect(db.prepare("SELECT content FROM messages WHERE id = ?").get(messageId)).toMatchObject({ content: "[erased]" });
  });

  it("lists subject-erasure plans and rejects unsupported actions", async () => {
    const unsupported = await subjectErasurePost(
      jsonRequest({
        action: "archive_plan",
        actorId: "operator",
      })
    );
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({
      ok: false,
      error: "unsupported action: archive_plan",
    });

    const { GET: subjectErasureGet } = await import("../subject-erasure/route");
    const listed = await subjectErasureGet(
      new Request("http://localhost:3110/api/memory-lifecycle/subject-erasure?tenantId=default-tenant&limit=2")
    );
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ ok: true, plans: [] });
  });

  it("validates consolidation payloads and accepts provider override summaries", async () => {
    const missingSources = await consolidationPost(
      jsonRequest({
        runKey: "route-consolidation-missing-sources",
        actorId: "operator",
        scope: { tenantId: "default-tenant" },
      })
    );
    expect(missingSources.status).toBe(400);
    expect(await missingSources.json()).toMatchObject({
      ok: false,
      error: "sources must be an array",
    });

    const response = await consolidationPost(
      jsonRequest({
        runKey: "route-consolidation-provider-override",
        actorId: "operator",
        scope: { tenantId: "default-tenant", purpose: "recall", project: "alpha" },
        providerOverride: { summary: "Operator supplied summary" },
        sources: [
          {
            canonicalId: "canonical-1",
            recordType: "message",
            recordId: "record-1",
            content: "One durable memory",
            contentHash: "sha256:record-1",
            ontologyType: "memory.note",
            tier: "episodic",
            classification: { visibility: "internal" },
          },
        ],
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.result.summaryId).toBeTruthy();
    const { getDb } = await import("@/lib/db");
    expect(
      getDb()
        .prepare("SELECT summary_content FROM memory_consolidation_summaries WHERE id = ?")
        .get(json.result.summaryId)
    ).toMatchObject({ summary_content: "Operator supplied summary" });
  });

  it("writes, verifies, and lists tombstones via lifecycle route", async () => {
    const missingSubject = await tombstonesGet(
      new Request("http://localhost:3110/api/memory-lifecycle/tombstones")
    );
    expect(missingSubject.status).toBe(400);
    expect(await missingSubject.json()).toMatchObject({ ok: false, error: "subjectHash is required" });

    const unsupported = await tombstonesPost(
      jsonRequest({
        action: "purge",
      })
    );
    expect(unsupported.status).toBe(400);

    const write = await tombstonesPost(
      jsonRequest({
        action: "write",
        tenantId: "default-tenant",
        subjectHash: "subject-route-tombstone",
        canonicalId: "canon-route",
        recordType: "message",
        recordId: "msg-route",
        recordIdHash: "hash-route",
        derivativeInventory: [
          { storeId: "vector", action: "purge", reason: "vector_projection" },
        ],
        policyId: "policy-route",
        policyVersion: "v1",
        erasureId: "erasure-route",
        scope: { tenantId: "default-tenant", purpose: "recall" },
        outcome: "erased",
        actorId: "operator",
        createdAt: "2026-07-18T10:00:00.000Z",
      })
    );
    expect(write.status).toBe(200);
    expect(await write.json()).toMatchObject({
      ok: true,
      tombstone: {
        subjectHash: "subject-route-tombstone",
        derivativeInventoryHash: expect.any(String),
      },
    });

    const verify = await tombstonesPost(
      jsonRequest({
        action: "verify",
        tenantId: "default-tenant",
        subjectHash: "subject-route-tombstone",
      })
    );
    expect(verify.status).toBe(200);
    expect(await verify.json()).toMatchObject({ ok: true, report: { valid: true, tombstonesChecked: 1 } });

    const listed = await tombstonesGet(
      new Request("http://localhost:3110/api/memory-lifecycle/tombstones?subjectHash=subject-route-tombstone")
    );
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      ok: true,
      tombstones: [expect.objectContaining({ subjectHash: "subject-route-tombstone" })],
    });

    const listedWithTenant = await tombstonesGet(
      new Request("http://localhost:3110/api/memory-lifecycle/tombstones?tenantId=default-tenant&subjectHash=subject-route-tombstone")
    );
    expect(listedWithTenant.status).toBe(200);
    expect((await listedWithTenant.json()).report.tombstonesChecked).toBe(1);
  });
});

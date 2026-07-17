// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TMP_ROOT = path.join(os.tmpdir(), `memlife-route-test-${crypto.randomUUID()}`);

const { POST: consolidationPost } = await import("../consolidation/route");
const { POST: dsarPost } = await import("../dsar/route");
const { POST: offboardingPost } = await import("../offboarding/route");
const { POST: tombstonesPost, GET: tombstonesGet } = await import("../tombstones/route");
const { GET: auditGet } = await import("../audit/route");
const { POST: vaultPost, GET: vaultGet } = await import("../vault/route");

vi.mock("@/lib/operator-auth", () => ({
  authorizeRegistryWrite: () => true,
  registryWriteUnauthorizedResponse: () => new Response("{}", { status: 401 }),
}));

function jsonRequest(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  process.env["SQLITE_DB_PATH"] = path.join(TMP_ROOT, `${crypto.randomUUID()}.db`);
  process.env["MEMROOS_VAULT_ROOT"] = path.join(TMP_ROOT, "vault");
  fs.mkdirSync(process.env["MEMROOS_VAULT_ROOT"]!, { recursive: true });
  const { closeDb } = await import("@/lib/db");
  closeDb();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db");
  closeDb();
  delete process.env["SQLITE_DB_PATH"];
  delete process.env["MEMROOS_VAULT_ROOT"];
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("memory lifecycle API routes (VAL-MEM-024..030)", () => {
  it("consolidation route completes a cycle and returns the run summary", async () => {
    const response = await consolidationPost(
      jsonRequest("http://localhost/api/memory-lifecycle/consolidation", {
        runKey: "route-run-1",
        actorId: "operator",
        scope: { tenantId: "default-tenant", purpose: "recall" },
        sources: [
          {
            canonicalId: "canon-route-1",
            recordType: "message",
            recordId: "1",
            content: "raw content",
            contentHash: crypto.createHash("sha256").update("raw content").digest("hex"),
            ontologyType: "memory.note",
            tier: "mid",
            classification: { visibility: "internal", policy: "sealed" },
          },
        ],
      })
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean; result: { status: string } };
    expect(json.ok).toBe(true);
    expect(json.result.status).toBe("completed");
  });

  it("vault route writes and replays an artifact with durability ledger", async () => {
    const writeResponse = await vaultPost(
      jsonRequest("http://localhost/api/memory-lifecycle/vault", {
        action: "write",
        tenantId: "default-tenant",
        actorId: "operator",
        sourceType: "memory.route.test",
        sourceId: "route-vault-1",
        body: "vault route body",
        label: { visibility: "private", policy: "sealed" },
      })
    );
    expect(writeResponse.status).toBe(200);
    const writeJson = (await writeResponse.json()) as { ok: boolean; artifact: { id: string } };
    expect(writeJson.ok).toBe(true);

    const replayResponse = await vaultPost(
      jsonRequest("http://localhost/api/memory-lifecycle/vault", {
        action: "replay",
        tenantId: "default-tenant",
        actorId: "operator",
        artifactId: writeJson.artifact.id,
      })
    );
    expect(replayResponse.status).toBe(200);
    const replayJson = (await replayResponse.json()) as { ok: boolean };
    expect(replayJson.ok).toBe(true);
  });

  it("offboarding route creates a pending review (idempotent on subject_hash)", async () => {
    const subjectHash = `route-subject-${crypto.randomUUID()}`;
    const first = await offboardingPost(
      jsonRequest("http://localhost/api/memory-lifecycle/offboarding", {
        action: "trigger",
        tenantId: "default-tenant",
        subjectHash,
        scope: { tenantId: "default-tenant", purpose: "recall" },
        actorId: "admin",
      })
    );
    expect(first.status).toBe(200);
    const second = await offboardingPost(
      jsonRequest("http://localhost/api/memory-lifecycle/offboarding", {
        action: "trigger",
        tenantId: "default-tenant",
        subjectHash,
        scope: { tenantId: "default-tenant", purpose: "recall" },
        actorId: "admin",
      })
    );
    expect(second.status).toBe(200);
    const firstJson = (await first.json()) as { receipt: { reviewId: string; idempotent: boolean } };
    const secondJson = (await second.json()) as { receipt: { reviewId: string; idempotent: boolean } };
    expect(secondJson.receipt.idempotent).toBe(true);
    expect(secondJson.receipt.reviewId).toBe(firstJson.receipt.reviewId);
  });

  it("tombstones route writes a non-sensitive pointer and verifies continuity", async () => {
    const writeResponse = await tombstonesPost(
      jsonRequest("http://localhost/api/memory-lifecycle/tombstones", {
        action: "write",
        tenantId: "default-tenant",
        subjectHash: "subject-route-tomb",
        canonicalId: "canon-route-tomb",
        recordType: "message",
        recordId: "msg-route-tomb",
        recordIdHash: crypto.createHash("sha256").update("msg-route-tomb").digest("hex"),
        derivativeInventory: [
          { storeId: "vector", action: "purge", reason: "v", sourceHash: "h", provenance: "p" },
        ],
        erasureId: "erasure-route-1",
        scope: { tenantId: "default-tenant", purpose: "recall", project: "alpha" },
        outcome: "erased",
        actorId: "operator",
      })
    );
    expect(writeResponse.status).toBe(200);

    const getUrl = `http://localhost/api/memory-lifecycle/tombstones?tenantId=default-tenant&subjectHash=subject-route-tomb`;
    const getResponse = await tombstonesGet(new Request(getUrl, { method: "GET" }));
    const json = (await getResponse.json()) as { ok: boolean; report: { valid: boolean; tombstonesChecked: number } };
    expect(json.ok).toBe(true);
    expect(json.report.valid).toBe(true);
  });

  it("audit route returns valid=true after a chain of memory events", async () => {
    // Trigger a consolidation to populate audit chain.
    await consolidationPost(
      jsonRequest("http://localhost/api/memory-lifecycle/consolidation", {
        runKey: "route-audit-run",
        actorId: "operator",
        scope: { tenantId: "default-tenant", purpose: "recall" },
        sources: [
          {
            canonicalId: "canon-audit-1",
            recordType: "message",
            recordId: "1",
            content: "x",
            contentHash: crypto.createHash("sha256").update("x").digest("hex"),
            ontologyType: "memory.note",
            tier: "mid",
            classification: { visibility: "internal", policy: "sealed" },
          },
        ],
      })
    );
    const response = await auditGet(
      new Request("http://localhost/api/memory-lifecycle/audit?tenantId=default-tenant", { method: "GET" })
    );
    const json = (await response.json()) as { ok: boolean; verification: { valid: boolean; checked: number } };
    expect(json.ok).toBe(true);
    expect(json.verification.valid).toBe(true);
    expect(json.verification.checked).toBeGreaterThanOrEqual(2);
  });

  it("DSAR route denies mismatched verification hash", async () => {
    const response = await dsarPost(
      jsonRequest("http://localhost/api/memory-lifecycle/dsar", {
        action: "submit",
        tenantId: "default-tenant",
        requestType: "export",
        subject: { subjectId: "route-subject" },
        scope: { tenantId: "default-tenant", purpose: "recall" },
        verificationMethod: "email_token",
        verificationHash: "deadbeef".repeat(8),
        actorId: "operator",
      })
    );
    expect([401, 403, 409]).toContain(response.status);
    const json = (await response.json()) as { ok: boolean; result: { status: string } };
    expect(json.ok).toBe(false);
    expect(json.result.status).toBe("denied");
  });

  it("vault route lists artifacts, reads by id, reconciles, and marks orphans", async () => {
    const writeResponse = await vaultPost(
      jsonRequest("http://localhost/api/memory-lifecycle/vault", {
        action: "write",
        tenantId: "default-tenant",
        actorId: "operator",
        sourceType: "memory.route.test",
        sourceId: "route-vault-list",
        body: "listable body",
        label: { visibility: "private", policy: "sealed", domain: "alpha" },
        replayMetadata: { source: "route-test" },
      })
    );
    const writeJson = (await writeResponse.json()) as { artifact: { id: string } };

    const listResponse = await vaultGet(
      new Request("http://localhost/api/memory-lifecycle/vault?tenantId=default-tenant&limit=5")
    );
    expect(listResponse.status).toBe(200);
    const listJson = (await listResponse.json()) as { ok: boolean; artifacts: Array<{ id: string }> };
    expect(listJson.ok).toBe(true);
    expect(listJson.artifacts.some((artifact) => artifact.id === writeJson.artifact.id)).toBe(true);

    const readResponse = await vaultGet(
      new Request(
        `http://localhost/api/memory-lifecycle/vault?tenantId=default-tenant&artifactId=${writeJson.artifact.id}`
      )
    );
    expect(readResponse.status).toBe(200);
    const readJson = (await readResponse.json()) as { ok: boolean; artifact: { id: string; hashVerified: boolean } };
    expect(readJson.artifact.id).toBe(writeJson.artifact.id);
    expect(readJson.artifact.hashVerified).toBe(true);

    const reconcileResponse = await vaultPost(
      jsonRequest("http://localhost/api/memory-lifecycle/vault", {
        action: "reconcile",
        tenantId: "default-tenant",
        actorId: "operator",
      })
    );
    expect(reconcileResponse.status).toBe(200);
    const reconcileJson = (await reconcileResponse.json()) as { ok: boolean; summary: Record<string, unknown> };
    expect(reconcileJson.ok).toBe(true);
    expect(reconcileJson.summary).toBeTruthy();

    const orphanResponse = await vaultPost(
      jsonRequest("http://localhost/api/memory-lifecycle/vault", {
        action: "mark_orphans",
        tenantId: "default-tenant",
        actorId: "operator",
      })
    );
    expect(orphanResponse.status).toBe(200);
    const orphanJson = (await orphanResponse.json()) as { ok: boolean; marked: number };
    expect(orphanJson.ok).toBe(true);
    expect(typeof orphanJson.marked).toBe("number");
  });

  it("vault route rejects unsupported actions and missing required fields", async () => {
    const unsupported = await vaultPost(
      jsonRequest("http://localhost/api/memory-lifecycle/vault", {
        action: "unknown",
        tenantId: "default-tenant",
        actorId: "operator",
      })
    );
    expect(unsupported.status).toBe(400);
    const unsupportedJson = (await unsupported.json()) as { error: string };
    expect(unsupportedJson.error).toContain("unsupported action");

    const missingActor = await vaultPost(
      jsonRequest("http://localhost/api/memory-lifecycle/vault", {
        action: "write",
        tenantId: "default-tenant",
        sourceType: "memory.route.test",
        body: "body",
      })
    );
    expect(missingActor.status).toBe(400);
  });

  it("offboarding route attaches plans, completes reviews, and returns 404 for missing reviews", async () => {
    const { getDb } = await import("@/lib/db");
    const subjectHash = `route-offboard-${crypto.randomUUID()}`;
    const triggerResponse = await offboardingPost(
      jsonRequest("http://localhost/api/memory-lifecycle/offboarding", {
        action: "trigger",
        tenantId: "default-tenant",
        subjectHash,
        scope: { tenantId: "default-tenant", purpose: "recall" },
        actorId: "admin",
      })
    );
    const triggerJson = (await triggerResponse.json()) as { receipt: { reviewId: string } };

    const attachResponse = await offboardingPost(
      jsonRequest("http://localhost/api/memory-lifecycle/offboarding", {
        action: "attach_plan",
        tenantId: "default-tenant",
        reviewId: triggerJson.receipt.reviewId,
        planId: "plan-route-1",
        actorId: "admin",
      })
    );
    expect(attachResponse.status).toBe(200);
    const attachJson = (await attachResponse.json()) as { ok: boolean; receipt: { pendingPlanId: string | null; status: string } };
    expect(attachJson.ok).toBe(true);
    expect(attachJson.receipt.pendingPlanId).toBe("plan-route-1");
    expect(attachJson.receipt.status).toBe("in_progress");

    const incompleteComplete = await offboardingPost(
      jsonRequest("http://localhost/api/memory-lifecycle/offboarding", {
        action: "complete",
        tenantId: "default-tenant",
        reviewId: triggerJson.receipt.reviewId,
        actorId: "admin",
      })
    );
    expect(incompleteComplete.status).toBe(400);
    const incompleteJson = (await incompleteComplete.json()) as { ok: boolean; error: string };
    expect(incompleteJson.ok).toBe(false);
    expect(incompleteJson.error).toContain("erasure");

    const db = getDb();
    db.prepare(
      `INSERT INTO memory_subject_erasure_plans (
        id, tenant_id, subject_hash, scope_hash, plan_hash, source_version_hash,
        created_by, status, result_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?)`
    ).run(
      "plan-route-1",
      "default-tenant",
      subjectHash,
      "scope-hash",
      "plan-hash",
      "source-hash",
      "operator",
      JSON.stringify({ status: "completed" })
    );

    const completeResponse = await offboardingPost(
      jsonRequest("http://localhost/api/memory-lifecycle/offboarding", {
        action: "complete",
        tenantId: "default-tenant",
        reviewId: triggerJson.receipt.reviewId,
        actorId: "admin",
      })
    );
    expect(completeResponse.status).toBe(200);
    const completeJson = (await completeResponse.json()) as { ok: boolean; receipt: { status: string } };
    expect(completeJson.ok).toBe(true);
    expect(completeJson.receipt.status).toBe("completed");

    const missingReview = await offboardingPost(
      jsonRequest("http://localhost/api/memory-lifecycle/offboarding", {
        action: "complete",
        tenantId: "default-tenant",
        reviewId: "missing-review",
        actorId: "admin",
      })
    );
    expect(missingReview.status).toBe(404);

    const unsupported = await offboardingPost(
      jsonRequest("http://localhost/api/memory-lifecycle/offboarding", {
        action: "unsupported",
        actorId: "admin",
      })
    );
    expect(unsupported.status).toBe(400);
  });

  it("DSAR route computes verification hash and accepts a verified export request", async () => {
    const { getDb } = await import("@/lib/db");
    const { computeDsarVerificationHash } = await import("@/lib/memory/dsar");
    const db = getDb();
    const messageId = db
      .prepare(
        `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
         VALUES(?,?,?,?,?,?,?,?)`
      )
      .run("dsar-route-session", "alpha", "agent", "user", "DSAR_ROUTE_PAYLOAD", "2026-01-01T00:00:00.000Z", "internal", "indexable")
      .lastInsertRowid as number;
    db.prepare("INSERT INTO memory_salience(message_id, tier, salience_score, last_decay_at) VALUES (?, 'mid', 1.0, ?)").run(
      messageId,
      "2025-12-31T00:00:00.000Z"
    );
    db.prepare(
      `INSERT OR IGNORE INTO memory_retention_policies
        (id, tenant_id, name, version, ontology_type, security_label_json, purpose, scope_json,
         priority, duration_days, action, enabled, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).run(
      "policy-dsar-route",
      "default-tenant",
      "dsar route policy",
      "v1",
      "memory.contact_event",
      JSON.stringify({ visibility: "internal" }),
      "recall",
      JSON.stringify({ tenantId: "default-tenant", project: "alpha" }),
      1,
      365,
      "expire",
      "operator",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT OR REPLACE INTO memory_retention_records
        (id, tenant_id, record_type, record_id, ontology_type, security_label_json, purpose, scope_json,
         policy_id, policy_version, retention_deadline, status, content_hash, created_at, updated_at)
       VALUES (?, ?, 'message', ?, 'memory.contact_event', ?, 'recall', ?, 'policy-dsar-route', 'v1', ?, 'active', ?, ?, ?)`
    ).run(
      `retrec_${messageId}`,
      "default-tenant",
      String(messageId),
      JSON.stringify({ visibility: "internal" }),
      JSON.stringify({ tenantId: "default-tenant", purpose: "recall", project: "alpha", subjectId: "route-dsar-subject" }),
      "2026-12-31T00:00:00.000Z",
      `hash-${messageId}`,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );

    const subject = { subjectId: "route-dsar-subject" };
    const verificationHash = computeDsarVerificationHash({
      subject,
      verificationMethod: "email_token",
      actorId: "operator",
      tenantId: "default-tenant",
    });

    const hashResponse = await dsarPost(
      jsonRequest("http://localhost/api/memory-lifecycle/dsar", {
        action: "verification_hash",
        tenantId: "default-tenant",
        subject,
        verificationMethod: "email_token",
        actorId: "operator",
      })
    );
    expect(hashResponse.status).toBe(200);
    const hashJson = (await hashResponse.json()) as { ok: boolean; verificationHash: string };
    expect(hashJson.ok).toBe(true);
    expect(hashJson.verificationHash).toBe(verificationHash);

    const submitResponse = await dsarPost(
      jsonRequest("http://localhost/api/memory-lifecycle/dsar", {
        action: "submit",
        tenantId: "default-tenant",
        requestType: "export",
        subject,
        scope: { tenantId: "default-tenant", purpose: "recall" },
        verificationMethod: "email_token",
        verificationHash,
        actorId: "operator",
        requestId: "dsar-route-export-1",
      })
    );
    expect(submitResponse.status).toBe(200);
    const submitJson = (await submitResponse.json()) as { ok: boolean; result: { status: string; requestId: string } };
    expect(submitJson.ok).toBe(true);
    expect(submitJson.result.requestId).toBe("dsar-route-export-1");
    expect(submitJson.result.status).toBe("exported");
  });

  it("DSAR execute_delete returns conflict when request is missing", async () => {
    const response = await dsarPost(
      jsonRequest("http://localhost/api/memory-lifecycle/dsar", {
        action: "execute_delete",
        tenantId: "default-tenant",
        requestId: "missing-dsar-request",
        planHash: "a".repeat(64),
        actorId: "operator",
      })
    );
    expect(response.status).toBe(409);
    const json = (await response.json()) as { ok: boolean; result: { reason: string } };
    expect(json.ok).toBe(false);
    expect(json.result.reason).toBe("dsar_request_not_found");
  });
});

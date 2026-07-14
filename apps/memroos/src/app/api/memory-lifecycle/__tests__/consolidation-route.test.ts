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
});

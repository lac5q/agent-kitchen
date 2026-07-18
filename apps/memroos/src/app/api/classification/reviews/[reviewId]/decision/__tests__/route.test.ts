// @vitest-environment node
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { classifyVaultArtifact } from "@/lib/classification/cascade";
import { writeVaultArtifact } from "@/lib/vault/writer";

let testDb: Database.Database;
let vaultRoot: string;
let sessionRole: "admin" | "operator" | "reviewer" | null = "reviewer";

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: async () =>
    sessionRole
      ? {
          userId: "reviewer-1",
          role: sessionRole,
          email: "reviewer@example.com",
          displayName: "Reviewer",
          tenantId: "default-tenant",
        }
      : null,
}));

beforeEach(() => {
  vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-classification-decision-"));
  vi.stubEnv("MEMROOS_VAULT_ROOT", vaultRoot);
  testDb = new Database(":memory:");
  initSchema(testDb);
  sessionRole = "reviewer";
});

afterEach(() => {
  testDb.close();
  fs.rmSync(vaultRoot, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.resetModules();
});

function seedReview(): string {
  testDb.prepare(
    `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp)
     VALUES ('session-public', 'marketing', 'codex', 'assistant', 'public website draft', '2026-05-24T00:00:00Z')`
  ).run();

  const artifact = writeVaultArtifact(testDb, {
    sourceType: "messages",
    sourceId: "session-public",
    sessionId: "session-public",
    project: "marketing",
    body: JSON.stringify({ content: "Draft for public website launch." }) + "\n",
  });
  const result = classifyVaultArtifact(testDb, artifact.id);
  if (!result.reviewId) throw new Error("expected review");
  return result.reviewId;
}

describe("/api/classification/reviews/:id/decision", () => {
  it("rejects unauthenticated decision attempts", async () => {
    sessionRole = null;
    const { POST } = await import("../route");

    const res = await POST(
      new Request("http://localhost/api/classification/reviews/review-1/decision", {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      }) as never,
      { params: Promise.resolve({ reviewId: "review-1" }) }
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "authentication required" });
  });

  it("validates review id, JSON body, and decision value before resolving", async () => {
    const { POST } = await import("../route");

    const missingId = await POST(
      new Request("http://localhost/api/classification/reviews//decision", {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      }) as never,
      { params: Promise.resolve({ reviewId: "" }) }
    );
    expect(missingId.status).toBe(400);
    expect((await missingId.json()).error).toBe("review id is required");

    const invalidJson = await POST(
      new Request("http://localhost/api/classification/reviews/review-1/decision", {
        method: "POST",
        body: "{not-json",
      }) as never,
      { params: Promise.resolve({ reviewId: "review-1" }) }
    );
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error).toBe("invalid json body");

    const invalidDecision = await POST(
      new Request("http://localhost/api/classification/reviews/review-1/decision", {
        method: "POST",
        body: JSON.stringify({ decision: "maybe" }),
      }) as never,
      { params: Promise.resolve({ reviewId: "review-1" }) }
    );
    expect(invalidDecision.status).toBe(400);
    expect((await invalidDecision.json()).error).toMatch(/decision must be/i);
  });

  it("maps missing reviews to 404 responses", async () => {
    const { POST } = await import("../route");

    const res = await POST(
      new Request("http://localhost/api/classification/reviews/missing-review/decision", {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      }) as never,
      { params: Promise.resolve({ reviewId: "missing-review" }) }
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it("records reviewer approval, appends a label version, updates message labels, and audits", async () => {
    const reviewId = seedReview();
    const { POST } = await import("../route");

    const res = await POST(
      new Request(`http://localhost/api/classification/reviews/${reviewId}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision: "approve",
          label: { visibility: "public_approved", policy: "indexable" },
          note: "Approved sanitized launch copy.",
        }),
      }) as never,
      { params: Promise.resolve({ reviewId }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.review).toMatchObject({ id: reviewId, status: "approved" });
    expect(body.label).toMatchObject({ visibility: "public_approved", policy: "indexable" });

    const labels = testDb
      .prepare("SELECT visibility, policy, label_version FROM artifact_labels ORDER BY label_version ASC")
      .all() as Array<{ visibility: string; policy: string; label_version: number }>;
    expect(labels).toEqual([
      expect.objectContaining({ visibility: "private", policy: "sealed", label_version: 1 }),
      expect.objectContaining({ visibility: "private", policy: "requires_human_review", label_version: 2 }),
      expect.objectContaining({ visibility: "public_approved", policy: "indexable", label_version: 3 }),
    ]);

    const message = testDb
      .prepare("SELECT visibility, policy FROM messages WHERE session_id = 'session-public'")
      .get() as { visibility: string; policy: string };
    expect(message).toEqual({ visibility: "public_approved", policy: "indexable" });

    const audit = testDb
      .prepare("SELECT action, target, detail FROM audit_log WHERE action = 'classification_review_decided'")
      .get() as { action: string; target: string; detail: string };
    expect(audit.target).toBe(reviewId);
    expect(audit.detail).toContain("Approved sanitized launch copy");
  });
});

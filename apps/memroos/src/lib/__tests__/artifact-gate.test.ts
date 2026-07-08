// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { initSchema } from "@/lib/db-schema";
import { createSpace, addSpaceMember } from "@/lib/space";
import { loadWorkspace } from "@/lib/workspace";
import { setSpaceShared } from "@/lib/shared-space";
import {
  promptSaveArtifact,
  saveArtifact,
  setAutoReadmeUpdate,
  isAutoReadmeUpdateEnabled,
  getLastArtifactPointer,
} from "@/lib/artifact-gate";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

function setup(): {
  db: Database.Database;
  spaceId: string;
  secondSpaceId: string;
  actorId: string;
} {
  const db = freshDb();
  const space = createSpace(db, { tenantId: "default-tenant", name: "growth" });
  const secondSpace = createSpace(db, { tenantId: "default-tenant", name: "ops" });
  const actorId = "user-1";
  addSpaceMember(db, { spaceId: space.id, memberId: actorId, memberType: "human" });
  addSpaceMember(db, { spaceId: secondSpace.id, memberId: actorId, memberType: "human" });
  // Load the first space as the active workspace so saveArtifact can write to it.
  loadWorkspace(db, { spaceId: space.id, actorId });
  return {
    db,
    spaceId: space.id,
    secondSpaceId: secondSpace.id,
    actorId,
  };
}

function countAuditRows(db: Database.Database, eventType: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM audit_entries WHERE event_type = ?")
    .get(eventType) as { n: number };
  return row.n;
}

describe("artifact-gate.ts (Phase 141 / ARTGATE-01..03)", () => {
  let db: Database.Database;
  let spaceId: string;
  let secondSpaceId: string;
  let actorId: string;

  beforeEach(() => {
    ({ db, spaceId, secondSpaceId, actorId } = setup());
  });

  it("1) promptSaveArtifact returns a prompt naming the target space (ARTGATE-01)", () => {
    const result = promptSaveArtifact(db, {
      spaceId,
      artifactName: "q3-report",
      artifactType: "report",
    });
    expect(result.spaceId).toBe(spaceId);
    expect(result.spaceName).toBe("growth");
    expect(result.artifactName).toBe("q3-report");
    expect(result.artifactType).toBe("report");
    expect(result.prompt).toBe("Save to growth?");
  });

  it("2) promptSaveArtifact throws when the space does not exist", () => {
    expect(() =>
      promptSaveArtifact(db, {
        spaceId: "spc_missing",
        artifactName: "x",
        artifactType: "report",
      }),
    ).toThrow(/not found/);
  });

  it("3) promptSaveArtifact throws when required fields are missing", () => {
    expect(() =>
      promptSaveArtifact(db, { spaceId: "", artifactName: "x", artifactType: "r" }),
    ).toThrow(/spaceId/);
    expect(() =>
      promptSaveArtifact(db, { spaceId, artifactName: "", artifactType: "r" }),
    ).toThrow(/artifactName/);
    expect(() =>
      promptSaveArtifact(db, { spaceId, artifactName: "x", artifactType: "" }),
    ).toThrow(/artifactType/);
  });

  it("4) saveArtifact creates a document directory entry and writes an artifact.saved audit row (ARTGATE-02)", () => {
    expect(countAuditRows(db, "artifact.saved")).toBe(0);
    const result = saveArtifact(db, {
      spaceId,
      artifactName: "q3-report",
      artifactType: "report",
      resourceId: "res_001",
      beliefStage: "silver_candidate_claim",
      actorId,
    });
    expect(result.documentDirectoryEntry.name).toBe("q3-report");
    expect(result.documentDirectoryEntry.resourceId).toBe("res_001");
    expect(result.documentDirectoryEntry.spaceId).toBe(spaceId);
    expect(countAuditRows(db, "artifact.saved")).toBe(1);
  });

  it("5) saveArtifact updates an existing document directory entry by name (ARTGATE-02)", () => {
    saveArtifact(db, {
      spaceId,
      artifactName: "q3-report",
      artifactType: "report",
      resourceId: "res_001",
      beliefStage: "silver_candidate_claim",
      actorId,
    });
    const result = saveArtifact(db, {
      spaceId,
      artifactName: "q3-report",
      artifactType: "report",
      resourceId: "res_002",
      beliefStage: "gold_verified",
      actorId,
    });
    expect(result.documentDirectoryEntry.resourceId).toBe("res_002");
    expect(result.documentDirectoryEntry.version).toBe(2);
    // Only one document_directory row for this name.
    const rows = db
      .prepare(
        "SELECT COUNT(*) AS n FROM document_directory WHERE space_id = ? AND name = ?",
      )
      .get(spaceId, "q3-report") as { n: number };
    expect(rows.n).toBe(1);
  });

  it("6) saveArtifact auto-updates the README pointer when enabled (ARTGATE-03)", () => {
    const result = saveArtifact(db, {
      spaceId,
      artifactName: "q3-report",
      artifactType: "report",
      resourceId: "res_001",
      beliefStage: "silver_candidate_claim",
      actorId,
    });
    expect(result.readmeUpdated).toBe(true);
    expect(countAuditRows(db, "artifact.readme_updated")).toBe(1);
    const pointer = getLastArtifactPointer(db, spaceId);
    expect(pointer).not.toBeNull();
    expect(pointer?.resourceId).toBe("res_001");
    expect(pointer?.name).toBe("q3-report");
    expect(pointer?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("7) saveArtifact does not update the README pointer when auto-readme is disabled (ARTGATE-03)", () => {
    setAutoReadmeUpdate(db, { spaceId, enabled: false, actorId });
    expect(isAutoReadmeUpdateEnabled(db, spaceId)).toBe(false);

    const result = saveArtifact(db, {
      spaceId,
      artifactName: "q3-report",
      artifactType: "report",
      resourceId: "res_001",
      beliefStage: "silver_candidate_claim",
      actorId,
    });
    expect(result.readmeUpdated).toBe(false);
    expect(countAuditRows(db, "artifact.readme_updated")).toBe(0);
    // No pointer row was written by this save.
    expect(getLastArtifactPointer(db, spaceId)).toBeNull();
  });

  it("8) saveArtifact throws when the space is shared read-only (ARTGATE-02 / SHAREDRO-01)", () => {
    setSpaceShared(db, { spaceId, isShared: true, actorId, reason: "review" });
    expect(() =>
      saveArtifact(db, {
        spaceId,
        artifactName: "q3-report",
        artifactType: "report",
        resourceId: "res_001",
        beliefStage: "silver_candidate_claim",
        actorId,
      }),
    ).toThrow(/SHAREDRO-01/);
  });

  it("9) saveArtifact throws when the target space is not the active workspace (ARTGATE-02)", () => {
    // secondSpaceId exists but is not the loaded workspace (the first space is).
    expect(() =>
      saveArtifact(db, {
        spaceId: secondSpaceId,
        artifactName: "q3-report",
        artifactType: "report",
        resourceId: "res_001",
        beliefStage: "silver_candidate_claim",
        actorId,
      }),
    ).toThrow(/active workspace/);
  });

  it("10) isAutoReadmeUpdateEnabled defaults to true when no settings row exists", () => {
    // Fresh space with no settings row yet.
    expect(isAutoReadmeUpdateEnabled(db, secondSpaceId)).toBe(true);
  });

  it("11) setAutoReadmeUpdate toggles the flag and writes an audit row (ARTGATE-03)", async () => {
    expect(countAuditRows(db, "artifact.auto_readme_toggled")).toBe(0);
    setAutoReadmeUpdate(db, { spaceId, enabled: false, actorId });
    expect(isAutoReadmeUpdateEnabled(db, spaceId)).toBe(false);
    expect(countAuditRows(db, "artifact.auto_readme_toggled")).toBe(1);

    // Yield so the second toggle gets a distinct created_at timestamp.
    await new Promise((r) => setTimeout(r, 5));
    setAutoReadmeUpdate(db, { spaceId, enabled: true, actorId });
    expect(isAutoReadmeUpdateEnabled(db, spaceId)).toBe(true);
    expect(countAuditRows(db, "artifact.auto_readme_toggled")).toBe(2);

    const row = db
      .prepare(
        "SELECT metadata_json FROM audit_entries WHERE event_type = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get("artifact.auto_readme_toggled") as { metadata_json: string };
    const meta = JSON.parse(row.metadata_json);
    expect(meta.actionType).toBe("artifact.auto_readme_toggled");
    expect(meta.enabled).toBe(true);
    expect(meta.spaceId).toBe(spaceId);
  });

  it("12) setAutoReadmeUpdate throws for an unknown space", () => {
    expect(() =>
      setAutoReadmeUpdate(db, {
        spaceId: "spc_missing",
        enabled: false,
        actorId,
      }),
    ).toThrow(/not found/);
  });

  it("13) getLastArtifactPointer returns null when no artifact has been saved", () => {
    expect(getLastArtifactPointer(db, spaceId)).toBeNull();
  });

  it("14) getLastArtifactPointer reflects the most recent saveArtifact call", () => {
    saveArtifact(db, {
      spaceId,
      artifactName: "report-a",
      artifactType: "report",
      resourceId: "res_a",
      beliefStage: "silver_candidate_claim",
      actorId,
    });
    saveArtifact(db, {
      spaceId,
      artifactName: "report-b",
      artifactType: "report",
      resourceId: "res_b",
      beliefStage: "gold_verified",
      actorId,
    });
    const pointer = getLastArtifactPointer(db, spaceId);
    expect(pointer?.resourceId).toBe("res_b");
    expect(pointer?.name).toBe("report-b");
  });
});

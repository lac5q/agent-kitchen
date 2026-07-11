import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { serializeQmdUpdate, finalizeQmdUpdate } from "../qmd";

describe("QMD Serializer", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE memory_qmd_updates (
        id TEXT PRIMARY KEY,
        target_path TEXT,
        source_hash TEXT,
        status TEXT,
        freshness_timestamp TEXT,
        last_success_timestamp TEXT
      );
    `);
  });

  it("VAL-MEM-012: qmd updates are serialized with bounded freshness states", () => {
    const state = serializeQmdUpdate(db, "target/path.md", "content");
    
    expect(state.status).toBe("pending");
    expect(state.id).toContain("qmd_upd_");
    
    const finalized = finalizeQmdUpdate(db, state.id, "success");
    expect(finalized.status).toBe("success");
    expect(finalized.lastSuccessTimestamp).toBeDefined();
    
    // Test failure doesn't advance lastSuccessTimestamp
    const failState = serializeQmdUpdate(db, "target/path2.md", "content2");
    const failedFinal = finalizeQmdUpdate(db, failState.id, "failed");
    expect(failedFinal.status).toBe("failed");
    expect(failedFinal.lastSuccessTimestamp).toBeFalsy();
  });
});

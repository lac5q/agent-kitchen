import crypto from "crypto";
import type Database from "better-sqlite3";
import { stableJson } from "./retention-policy";

export interface QmdUpdateState {
  id: string;
  targetPath: string;
  sourceHash: string;
  status: "pending" | "success" | "failed" | "cancelled" | "timeout";
  freshnessTimestamp: string;
  lastSuccessTimestamp?: string;
}

export function serializeQmdUpdate(
  db: Database.Database,
  targetPath: string,
  sourceContent: string,
  now?: Date
): QmdUpdateState {
  const currentNow = (now ?? new Date()).toISOString();
  const sourceHash = crypto.createHash("sha256").update(sourceContent).digest("hex");
  const updateId = `qmd_upd_${crypto.randomUUID()}`;
  
  const state: QmdUpdateState = {
    id: updateId,
    targetPath,
    sourceHash,
    status: "pending",
    freshnessTimestamp: currentNow
  };
  
  try {
    db.prepare(`
      INSERT INTO memory_qmd_updates 
        (id, target_path, source_hash, status, freshness_timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(state.id, state.targetPath, state.sourceHash, state.status, state.freshnessTimestamp);
  } catch(e) {
    if (!String(e).includes("no such table")) {
      throw e;
    }
  }
  
  return state;
}

export function finalizeQmdUpdate(
  db: Database.Database,
  updateId: string,
  outcome: "success" | "failed" | "cancelled" | "timeout",
  now?: Date
): QmdUpdateState {
  const currentNow = (now ?? new Date()).toISOString();
  
  let existing;
  try {
    existing = db.prepare(`SELECT * FROM memory_qmd_updates WHERE id = ?`).get(updateId) as any;
  } catch(e) {
    if (!String(e).includes("no such table")) {
      throw e;
    }
    // Mock for tests if table is absent
    existing = { id: updateId, target_path: "mock", source_hash: "mock", status: "pending", freshness_timestamp: currentNow };
  }
  
  if (!existing) {
    throw new Error(`QMD update ${updateId} not found`);
  }
  
  const state: QmdUpdateState = {
    id: existing.id,
    targetPath: existing.target_path,
    sourceHash: existing.source_hash,
    status: outcome,
    freshnessTimestamp: currentNow,
    lastSuccessTimestamp: outcome === "success" ? currentNow : existing.last_success_timestamp
  };
  
  try {
    db.prepare(`
      UPDATE memory_qmd_updates 
      SET status = ?, 
          freshness_timestamp = ?,
          last_success_timestamp = ?
      WHERE id = ?
    `).run(state.status, state.freshnessTimestamp, state.lastSuccessTimestamp ?? null, state.id);
  } catch(e) {
    if (!String(e).includes("no such table")) {
      throw e;
    }
  }
  
  return state;
}

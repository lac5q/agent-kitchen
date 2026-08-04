import type Database from "better-sqlite3";

export type SalienceRecordType = "message" | "agent_memory_write" | "agent_memory_candidate";

export type SalienceTier = "pinned" | "high" | "mid" | "low";

function tableExists(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_salience'")
    .get() as { name: string } | undefined;
  return Boolean(row);
}

function tierForScore(score: number): SalienceTier {
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "mid";
  return "low";
}

export function ensureMemorySalience(
  db: Database.Database,
  recordType: Exclude<SalienceRecordType, "message">,
  recordId: string,
  initialScore = 1
): void {
  if (!tableExists(db) || !recordId.trim()) return;
  const score = Math.max(0, Math.min(1, initialScore));
  db.prepare(
    `INSERT OR IGNORE INTO memory_salience (message_id, record_type, record_id, tier, salience_score)
     VALUES (NULL, ?, ?, ?, ?)`
  ).run(recordType, recordId, tierForScore(score), score);
}

function targetFromPointer(value: string): { recordType: SalienceRecordType; recordId: string } | null {
  const separator = value.indexOf(":");
  if (separator <= 0) return null;
  const prefix = value.slice(0, separator);
  const recordId = value.slice(separator + 1).trim();
  if (!recordId) return null;
  if (prefix === "messages" || prefix === "message") return { recordType: "message", recordId };
  if (prefix === "agent_memory_writes" || prefix === "agent_memory_write") {
    return { recordType: "agent_memory_write", recordId };
  }
  if (prefix === "agent_memory_candidates" || prefix === "agent_memory_candidate") {
    return { recordType: "agent_memory_candidate", recordId };
  }
  return null;
}

export function salienceTargetsFromMetadata(metadata: Record<string, unknown>): Array<{
  recordType: SalienceRecordType;
  recordId: string;
}> {
  const values: string[] = [];
  for (const key of ["memoryId", "memory_id", "recordId", "record_id", "candidateId", "candidate_id", "writeId", "write_id"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) values.push(value.trim());
    if (typeof value === "number" && Number.isFinite(value)) values.push(String(value));
  }
  for (const key of ["memoryIds", "memory_ids", "recordIds", "record_ids"]) {
    const value = metadata[key];
    if (Array.isArray(value)) {
      values.push(...value.filter((entry): entry is string | number => typeof entry === "string" || typeof entry === "number").map(String));
    }
  }

  const explicitType = typeof metadata.recordType === "string" ? metadata.recordType : typeof metadata.record_type === "string" ? metadata.record_type : null;
  const targets: Array<{ recordType: SalienceRecordType; recordId: string }> = [];
  for (const value of values) {
    const parsed = targetFromPointer(value);
    if (parsed) {
      targets.push(parsed);
      continue;
    }
    if (explicitType === "message" || explicitType === "agent_memory_write" || explicitType === "agent_memory_candidate") {
      targets.push({ recordType: explicitType, recordId: value });
    }
  }
  return targets.filter((target, index) => targets.findIndex((candidate) => candidate.recordType === target.recordType && candidate.recordId === target.recordId) === index);
}

export function reinforceMemorySalience(
  db: Database.Database,
  targets: Array<{ recordType: SalienceRecordType; recordId: string }>,
  outcome: string
): number {
  if (!tableExists(db) || targets.length === 0) return 0;
  const normalized = outcome.trim().toLowerCase();
  const delta = /\b(?:helped|useful|success|succeeded|worked|resolved|yes)\b/.test(normalized)
    ? 0.1
    : /\b(?:failed|failure|unhelpful|wrong|stale|no)\b/.test(normalized)
      ? -0.05
      : 0.02;
  let changed = 0;
  for (const target of targets) {
    const result = db.prepare(
      `UPDATE memory_salience
       SET salience_score = MIN(1.0, MAX(0.0, salience_score + ?)),
           tier = CASE
             WHEN MIN(1.0, MAX(0.0, salience_score + ?)) >= 0.8 THEN 'high'
             WHEN MIN(1.0, MAX(0.0, salience_score + ?)) >= 0.5 THEN 'mid'
             ELSE 'low'
           END,
           access_count = access_count + 1,
           last_accessed = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE record_type = ? AND record_id = ?`
    ).run(delta, delta, delta, target.recordType, target.recordId);
    changed += Number(result.changes ?? 0);
  }
  return changed;
}

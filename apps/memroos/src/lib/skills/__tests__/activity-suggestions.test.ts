// @vitest-environment node
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildSkillSuggestionAudit, persistSkillSuggestions } from "../activity-suggestions";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-suggestions-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeRecentJsonl(relativePath: string, content: string) {
  const filePath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  const recent = new Date("2026-07-17T00:00:00.000Z");
  fs.utimesSync(filePath, recent, recent);
  return filePath;
}

describe("activity skill suggestions", () => {
  it("scores recent activity evidence and detects existing harness skills", () => {
    const activityRoot = path.join(dir, "activity");
    const skillRoot = path.join(dir, "skills");
    writeRecentJsonl(
      "activity/session.jsonl",
      [
        "agent chat provider quota fallback model dispatch",
        "agent chat provider fallback model",
        "memory classification visibility policy sealed vault",
      ].join("\n"),
    );
    fs.mkdirSync(path.join(skillRoot, "agent-chat-provider-failover"), { recursive: true });
    fs.writeFileSync(path.join(skillRoot, "agent-chat-provider-failover", "SKILL.md"), "# existing");

    const suggestions = buildSkillSuggestionAudit({
      now: new Date("2026-07-18T00:00:00.000Z"),
      days: 7,
      activityRoots: { codex: activityRoot },
      skillRoots: { codex: skillRoot },
    });

    const failover = suggestions.find((suggestion) => suggestion.slug === "agent-chat-provider-failover");
    const memory = suggestions.find((suggestion) => suggestion.slug === "memroos-memory-classification");

    expect(failover).toMatchObject({
      name: "Agent Chat Provider Failover",
      status: "proposed",
      comparedHarnesses: {
        codex: { exists: true, path: path.join(skillRoot, "agent-chat-provider-failover", "SKILL.md") },
      },
    });
    expect(failover?.recommendation).toContain("Existing harness coverage found");
    expect(failover?.evidence[0]).toMatch(/codex:session\.jsonl/);
    expect(memory?.confidence).toBeGreaterThanOrEqual(0.35);
  });

  it("ignores stale or unreadable activity roots while still returning deterministic proposals", () => {
    const staleRoot = path.join(dir, "stale");
    const staleFile = writeRecentJsonl("stale/old.jsonl", "noc telemetry date filter workspace");
    const old = new Date("2025-01-01T00:00:00.000Z");
    fs.utimesSync(staleFile, old, old);

    const suggestions = buildSkillSuggestionAudit({
      now: new Date("2026-07-18T00:00:00.000Z"),
      days: 1,
      activityRoots: { codex: staleRoot, missing: path.join(dir, "missing") },
      skillRoots: { memroos: path.join(dir, "no-skills") },
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((suggestion) => suggestion.evidence.length === 0)).toBe(true);
    expect([...suggestions].sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name))).toEqual(
      suggestions,
    );
  });

  it("persists suggestions idempotently by id", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE skill_suggestions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_pattern TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        confidence REAL NOT NULL,
        evidence_json TEXT NOT NULL,
        compared_harnesses_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    const suggestion = buildSkillSuggestionAudit({
      now: new Date("2026-07-18T00:00:00.000Z"),
      days: 7,
      activityRoots: {},
      skillRoots: { memroos: path.join(dir, "skills") },
    })[0];

    persistSkillSuggestions(db, [suggestion]);
    persistSkillSuggestions(db, [{ ...suggestion, recommendation: "Updated recommendation" }]);

    const rows = db.prepare("SELECT id, recommendation, evidence_json FROM skill_suggestions").all() as Array<{
      id: string;
      recommendation: string;
      evidence_json: string;
    }>;
    expect(rows).toEqual([
      {
        id: suggestion.id,
        recommendation: "Updated recommendation",
        evidence_json: JSON.stringify(suggestion.evidence),
      },
    ]);
    db.close();
  });
});

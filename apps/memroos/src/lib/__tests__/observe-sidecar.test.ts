import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  listSessionJsonlFiles,
  OBSERVE_HARNESS_PATHS,
  resolveObserveRoots,
  summarizeSessionJsonl,
} from "@/lib/observe-sidecar";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("observe sidecar path policy", () => {
  it("includes Pi in Wave 1 roots", () => {
    const roots = resolveObserveRoots("/tmp/fake-home", 1);
    expect(roots.some((r) => r.harness === "pi")).toBe(true);
    expect(roots.some((r) => r.harness === "cursor")).toBe(false);
  });

  it("includes Cursor/Factory in Wave 2 and Antigravity only at wave 3 catalog", () => {
    const wave2 = resolveObserveRoots("/tmp/fake-home", 2);
    expect(wave2.some((r) => r.harness === "cursor")).toBe(true);
    expect(wave2.some((r) => r.harness === "factory")).toBe(true);
    const wave3 = resolveObserveRoots("/tmp/fake-home", 3);
    // Antigravity has empty session roots but remains in catalog for honesty.
    expect(wave3.some((r) => r.harness === "antigravity")).toBe(false);
  });

  it("lists jsonl sessions and summarizes them", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "observe-home-"));
    tempDirs.push(home);
    const sessionDir = path.join(home, ".pi", "agent", "sessions");
    fs.mkdirSync(sessionDir, { recursive: true });
    const file = path.join(sessionDir, "sess-pi-1.jsonl");
    fs.writeFileSync(file, '{"role":"user","text":"hello pi"}\n{"role":"assistant","text":"hi"}\n', "utf8");

    const files = listSessionJsonlFiles(sessionDir);
    expect(files).toEqual([file]);
    const summary = summarizeSessionJsonl(file);
    expect(summary.sessionId).toBe("sess-pi-1");
    expect(summary.lineCount).toBe(2);
    expect(summary.summary).toContain("hello pi");
  });

  it("returns empty lists for missing roots and unreadable files", () => {
    expect(listSessionJsonlFiles("/tmp/observe-missing-root-xyz")).toEqual([]);
    const summary = summarizeSessionJsonl("/tmp/observe-missing-file.jsonl");
    expect(summary.lineCount).toBe(0);
    expect(summary.sessionId).toBe("observe-missing-file");
  });

  // OBSERVE-10 / 11 / 12 hardening: each Wave 2/3 row must have either a
  // smoke-test path documented in notes OR an honest "no path, no claim"
  // string. These tests guard against silent regressions where a row gets
  // marked mcp-only / hooks / jsonl with no verifying artifact.

  it("Cursor (OBSERVE-10) keeps mcp-partial maturity and documents non-vendor-free JSONL", () => {
    const cursorEntry = OBSERVE_HARNESS_PATHS.find((e) => e.harness === "cursor");
    expect(cursorEntry).toBeDefined();
    expect(cursorEntry!.wave).toBe(2);
    expect(cursorEntry!.maturity).toBe("mcp-partial");
    // Notes must contain an explicit no-false-claim phrase so we never silently
    // upgrade this row. The vendor exports inside <timestamp>/<user_query> are
    // real but their shape is non-standard, so mcp-partial stays honest.
    expect(cursorEntry!.notes).toMatch(/MCP-only; no JSONL export/i);
    expect(cursorEntry!.notes).toMatch(/agent-transcripts/);
  });

  it("Factory/Droid (OBSERVE-11) maps droid, lists JSONL roots, and notes carry 'droid'", () => {
    const factoryEntry = OBSERVE_HARNESS_PATHS.find((e) => e.harness === "factory");
    expect(factoryEntry).toBeDefined();
    expect(factoryEntry!.wave).toBe(2);
    // Maturity is the upgraded joint hooks+jsonl because both the MCP server
    // config at ~/.factory/mcp.json and the JSONL log at
    // ~/.factory/sessions/-<cwd>/<session-uuid>.jsonl are observable on a
    // verified box.
    expect(factoryEntry!.maturity).toBe("hooks+jsonl");
    expect(factoryEntry!.sessionRoots).toContain(".factory/sessions");
    expect(factoryEntry!.sessionRoots).toContain(".factory");
    // Notes string must explicitly mention "droid" so it ties back to
    // CodingAgentRuntime.droid platform mapping.
    expect(factoryEntry!.notes.toLowerCase()).toContain("droid");
  });

  it("Antigravity (OBSERVE-12) row exists in catalog with honest 'no capture path' note", () => {
    const antigravityEntry = OBSERVE_HARNESS_PATHS.find((e) => e.harness === "antigravity");
    expect(antigravityEntry).toBeDefined();
    expect(antigravityEntry!.wave).toBe(3);
    expect(antigravityEntry!.maturity).toBe("limited");
    expect(antigravityEntry!.sessionRoots).toEqual([]);
    // The notes string must contain an honest "no capture path" disclaimer so
    // we never silently promote this row. Antigravity remains a stub until a
    // verifiable exporter is published.
    expect(antigravityEntry!.notes.toLowerCase()).toContain("no capture path");
    expect(antigravityEntry!.notes.toLowerCase()).toContain("verify-by-design");
  });

  it("Wave 2 factory roots resolve and surface real JSONL on a populated home (smoke path)", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "observe-factory-home-"));
    tempDirs.push(home);
    // Build the factory directory shape: ~/.factory/sessions/-<cwd>/<session>.jsonl
    const sessionDir = path.join(home, ".factory", "sessions", "-home-test");
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionFile = path.join(sessionDir, "f1c1c1c1-1111-2222-3333-444455556666.jsonl");
    fs.writeFileSync(
      sessionFile,
      '{"type":"session_start","id":"f1c1c1c1-1111-2222-3333-444455556666","title":"smoke","owner":"test","version":2,"cwd":"/home/test"}\n' +
      '{"type":"message","id":"m1","timestamp":"2026-07-18T00:00:00.000Z","message":{"role":"user","content":[{"type":"text","text":"hi"}]}}\n',
      "utf8"
    );

    const wave2Roots = resolveObserveRoots(home, 2);
    const factoryRoots = wave2Roots.filter((r) => r.harness === "factory");
    expect(factoryRoots.length).toBeGreaterThanOrEqual(2);
    const sessionsRoot = factoryRoots.find((r) => r.root === path.join(home, ".factory", "sessions"));
    expect(sessionsRoot).toBeDefined();
    expect(sessionsRoot!.maturity).toBe("hooks+jsonl");

    const listed = listSessionJsonlFiles(sessionsRoot!.root);
    expect(listed).toEqual([sessionFile]);

    const summary = summarizeSessionJsonl(sessionFile);
    expect(summary.sessionId).toBe("f1c1c1c1-1111-2222-3333-444455556666");
    expect(summary.lineCount).toBe(2);
    expect(summary.summary).toContain("smoke");
  });
});

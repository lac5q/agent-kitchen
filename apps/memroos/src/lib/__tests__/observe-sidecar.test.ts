import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  listSessionJsonlFiles,
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
});

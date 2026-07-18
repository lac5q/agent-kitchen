/**
 * Observe sidecar path catalog + session file discovery (v8.16 Wave 1).
 *
 * The sidecar itself is a Node script under scripts/; this module is the
 * shared path policy used by tests and (later) in-app visibility.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ObserveHarness =
  | "claude"
  | "codex"
  | "hermes"
  | "openclaw"
  | "pi"
  | "cursor"
  | "factory"
  | "antigravity";

export interface ObserveHarnessPath {
  harness: ObserveHarness;
  wave: 1 | 2 | 3;
  /** Glob-like roots relative to home; resolved at runtime. */
  sessionRoots: string[];
  maturity: "jsonl" | "hooks" | "plugin" | "mcp-partial" | "limited";
}

export const OBSERVE_HARNESS_PATHS: ObserveHarnessPath[] = [
  {
    harness: "claude",
    wave: 1,
    sessionRoots: [".claude/projects"],
    maturity: "jsonl",
  },
  {
    harness: "codex",
    wave: 1,
    sessionRoots: [".codex/sessions"],
    maturity: "jsonl",
  },
  {
    harness: "hermes",
    wave: 1,
    sessionRoots: [".hermes/sessions"],
    maturity: "plugin",
  },
  {
    harness: "openclaw",
    wave: 1,
    sessionRoots: [".openclaw/sessions", ".hermes/sessions"],
    maturity: "jsonl",
  },
  {
    harness: "pi",
    wave: 1,
    sessionRoots: [".pi/agent/sessions"],
    maturity: "jsonl",
  },
  {
    harness: "cursor",
    wave: 2,
    sessionRoots: [".cursor/projects"],
    maturity: "mcp-partial",
  },
  {
    harness: "factory",
    wave: 2,
    sessionRoots: [".factory"],
    maturity: "hooks",
  },
  {
    harness: "antigravity",
    wave: 3,
    sessionRoots: [],
    maturity: "limited",
  },
];

export function resolveObserveRoots(
  homeDir = os.homedir(),
  wave: 1 | 2 | 3 = 1
): Array<{ harness: ObserveHarness; root: string; maturity: ObserveHarnessPath["maturity"] }> {
  const out: Array<{ harness: ObserveHarness; root: string; maturity: ObserveHarnessPath["maturity"] }> = [];
  for (const entry of OBSERVE_HARNESS_PATHS) {
    if (entry.wave > wave) continue;
    for (const rel of entry.sessionRoots) {
      out.push({
        harness: entry.harness,
        root: path.join(homeDir, rel),
        maturity: entry.maturity,
      });
    }
  }
  return out;
}

/** Recursively list *.jsonl session files under a root (bounded depth). */
export function listSessionJsonlFiles(root: string, maxDepth = 6): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > maxDepth || files.length >= 500) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(full);
    }
  }
  walk(root, 0);
  return files;
}

export function summarizeSessionJsonl(filePath: string): {
  sessionId: string;
  summary: string;
  lineCount: number;
} {
  const sessionId = path.basename(filePath, ".jsonl");
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return { sessionId, summary: "", lineCount: 0 };
  }
  const lines = content.split(/\r?\n/).filter(Boolean);
  const preview = lines.slice(0, 5).join(" ").slice(0, 240);
  return {
    sessionId,
    summary: preview || `Session ${sessionId}`,
    lineCount: lines.length,
  };
}

/**
 * Observe sidecar path catalog + session file discovery (v8.16 Wave 1..3).
 *
 * The sidecar itself is a Node script under scripts/; this module is the
 * shared path policy used by tests and (later) in-app visibility. Wave 1
 * entries are proven via the Pi/Codex/etc. JSONL watchers. Wave 2 Cursor
 * and Factory/Droid catalog rows carry explicit notes on whether a smoke
 * test path exists (factory/hooks+jsonl) or only an honest "no path"
 * disclaimer applies (cursor/mcp-only, antigravity/no-surface). Wave 3
 * rows document Antigravity as a stub entry with no capture path so we
 * never make a false full-capture claim (OBSERVE-10/11/12).
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
  /**
   * Capture maturity. Wave 1 rows have a smoke-tested path; Wave 2/3 rows
   * carry an explicit notes string explaining whether JSONL exists, whether
   * MCP is the only path, or whether no surface is verified at all.
   */
  maturity:
    | "jsonl"
    | "hooks"
    | "hooks+jsonl"
    | "plugin"
    | "mcp-partial"
    | "mcp-only"
    | "limited";
  /** Human-readable note describing the actual capture path. */
  notes: string;
}

export const OBSERVE_HARNESS_PATHS: ObserveHarnessPath[] = [
  {
    harness: "claude",
    wave: 1,
    sessionRoots: [".claude/projects"],
    maturity: "jsonl",
    notes:
      "Wave 1 first-class Claude Code JSONL at ~/.claude/projects; capture shipped and smoke-tested in Phase 169.",
  },
  {
    harness: "codex",
    wave: 1,
    sessionRoots: [".codex/sessions"],
    maturity: "jsonl",
    notes:
      "Wave 1 first-class Codex JSONL at ~/.codex/sessions; capture shipped and smoke-tested in Phase 169.",
  },
  {
    harness: "hermes",
    wave: 1,
    sessionRoots: [".hermes/sessions"],
    maturity: "plugin",
    notes:
      "Wave 1 first-class Hermes plugin + JSONL at ~/.hermes/sessions; capture shipped and smoke-tested in Phase 169.",
  },
  {
    harness: "openclaw",
    wave: 1,
    sessionRoots: [".openclaw/sessions", ".hermes/sessions"],
    maturity: "jsonl",
    notes:
      "Wave 1 first-class OpenClaw JSONL at ~/.openclaw/sessions (also rides Hermes families under ~/.hermes/sessions); shipped in Phase 169.",
  },
  {
    harness: "pi",
    wave: 1,
    sessionRoots: [".pi/agent/sessions"],
    maturity: "jsonl",
    notes:
      "Wave 1 first-class Pi sessions under ~/.pi/agent/sessions; capture shipped and smoke-tested in Phase 169 (OBSERVE-05/07/09).",
  },
  {
    harness: "cursor",
    wave: 2,
    // Cursor IDE's session export is non-standard: agent-transcripts/<uuid>/<uuid>.jsonl
    // exists but uses vendor-specific tags inside <timestamp>/<user_query>. We do not
    // promise full-capture fidelity; rely on the MCP server and its hooks.
    sessionRoots: [".cursor/projects"],
    maturity: "mcp-partial",
    notes:
      "MCP-only; no JSONL export; rely on MCP server hooks. Cursor transcribes are available at ~/.cursor/projects/*/agent-transcripts/<session>/<session>.jsonl but schema is vendor-specific (timestamps/user_query/tool_use inside text). Maturity stays mcp-partial; promote only when the vendor schema is stable.",
  },
  {
    harness: "factory",
    wave: 2,
    // Factory/Droid is the canonical platform=droid runtime (see CodingAgentRuntime).
    // Both the MCP server (configured via ~/.factory/mcp.json) and the structured
    // JSONL session log at ~/.factory/sessions/-<cwd>/<session-uuid>.jsonl are real.
    // The session file begins with a session_start event (id, title, owner, cwd) and
    // continues with message events whose roles map cleanly through the agent
    // memory continuity capture path. We mark maturity=hooks+jsonl because both
    // surfaces are observable on this box.
    sessionRoots: [".factory", ".factory/sessions"],
    maturity: "hooks+jsonl",
    notes:
      "Wave 2 droid with JSONL fallback at ~/.factory/sessions/-<cwd-dir>/<session-uuid>.jsonl plus MCP hooks via ~/.factory/mcp.json. Both surfaces verified on the dev box; platform=droid captures map through CodingAgentRuntime.droid; promote to first-class jsonl once an official Droid schema lands.",
  },
  {
    harness: "antigravity",
    wave: 3,
    // Antigravity has no verified CLI, no JSONL surface, and no MCP server we have
    // observed on a real box. Capture remains a verify-by-design claim: the catalog
    // row exists so the operator health endpoint can honestly report "no path" rather
    // than fake coverage.
    sessionRoots: [],
    maturity: "limited",
    notes:
      "no capture path; observe via MCP only; verify-by-design. Antigravity sessionRoots are empty because we have not located a CLI/JSONL/MCP surface for it on any audited host. Do not promote to mcp-only or jsonl without a reproducible exporter; that would be a false full-capture claim.",
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

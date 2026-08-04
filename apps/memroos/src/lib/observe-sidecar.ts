/**
 * Observe sidecar path catalog + session file discovery (v8.16 Wave 1..3).
 *
 * The sidecar itself is a Node script under scripts/; this module is the
 * shared path policy used by tests and (later) in-app visibility. Wave 1
 * entries are proven via the Pi/Codex/etc. JSONL watchers. Wave 2 Cursor
 * and Factory/Droid catalog rows carry explicit notes on whether JSONL exists,
 * whether MCP is the only capture path, and whether lifecycle hooks are
 * actually verified. Wave 3 rows document Antigravity as a stub entry with no
 * capture path so we never make a false full-capture claim (OBSERVE-10/11/12).
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
  /** Verified session lifecycle hook surface, independent of JSONL capture. */
  hookSupport: "native" | "portable" | "plugin" | "none";
  /** Repo-shipped hooks the installer can actually wire for this harness. */
  installedHooks: Array<"memory-brief" | "capture-gate">;
  /** Honest fallback when lifecycle hooks are unavailable. */
  fallback: "skill+sidecar" | "none";
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
    hookSupport: "native",
    installedHooks: ["memory-brief", "capture-gate"],
    fallback: "skill+sidecar",
    sessionRoots: [".claude/projects"],
    maturity: "jsonl",
    notes:
      "Wave 1 first-class Claude Code JSONL at ~/.claude/projects; capture shipped and smoke-tested in Phase 169.",
  },
  {
    harness: "codex",
    wave: 1,
    hookSupport: "portable",
    installedHooks: ["memory-brief", "capture-gate"],
    fallback: "skill+sidecar",
    sessionRoots: [".codex/sessions"],
    maturity: "jsonl",
    notes:
      "Wave 1 first-class Codex JSONL at ~/.codex/sessions; capture shipped and smoke-tested in Phase 169.",
  },
  {
    harness: "hermes",
    wave: 1,
    hookSupport: "plugin",
    installedHooks: ["memory-brief", "capture-gate"],
    fallback: "skill+sidecar",
    sessionRoots: [".hermes/sessions"],
    maturity: "plugin",
    notes:
      "Wave 1 first-class Hermes plugin + JSONL at ~/.hermes/sessions; capture shipped and smoke-tested in Phase 169.",
  },
  {
    harness: "openclaw",
    wave: 1,
    hookSupport: "none",
    installedHooks: [],
    fallback: "skill+sidecar",
    sessionRoots: [".openclaw/sessions", ".hermes/sessions"],
    maturity: "jsonl",
    notes:
      "Wave 1 first-class OpenClaw JSONL at ~/.openclaw/sessions (also rides Hermes families under ~/.hermes/sessions); shipped in Phase 169.",
  },
  {
    harness: "pi",
    wave: 1,
    hookSupport: "none",
    installedHooks: [],
    fallback: "skill+sidecar",
    sessionRoots: [".pi/agent/sessions"],
    maturity: "jsonl",
    notes:
      "Wave 1 first-class Pi sessions under ~/.pi/agent/sessions; capture shipped and smoke-tested in Phase 169 (OBSERVE-05/07/09).",
  },
  {
    harness: "cursor",
    wave: 2,
    hookSupport: "none",
    installedHooks: [],
    fallback: "skill+sidecar",
    // Cursor IDE's session export is non-standard: agent-transcripts/<uuid>/<uuid>.jsonl
    // exists but uses vendor-specific tags inside <timestamp>/<user_query>. We do not
    // promise full-capture fidelity; the fallback remains skill + sidecar.
    sessionRoots: [".cursor/projects"],
    maturity: "mcp-partial",
    notes:
      "MCP-only; no JSONL export; rely on MCP server hooks. Cursor transcribes are available at ~/.cursor/projects/*/agent-transcripts/<session>/<session>.jsonl but schema is vendor-specific (timestamps/user_query/tool_use inside text). Maturity stays mcp-partial; promote only when the vendor schema is stable.",
  },
  {
    harness: "factory",
    wave: 2,
    hookSupport: "none",
    installedHooks: [],
    fallback: "skill+sidecar",
    // Factory/Droid is the canonical platform=droid runtime (see CodingAgentRuntime).
    // Both the MCP server (configured via ~/.factory/mcp.json) and the structured
    // JSONL session log at ~/.factory/sessions/-<cwd>/<session-uuid>.jsonl are real.
    // The session file begins with a session_start event (id, title, owner, cwd) and
    // continues with message events whose roles map cleanly through the agent
    // memory continuity capture path. We retain maturity=hooks+jsonl as a
    // capture label, but do not claim a lifecycle hook surface until an official
    // hook API is reproducible.
    sessionRoots: [".factory", ".factory/sessions"],
    maturity: "hooks+jsonl",
    notes:
      "Wave 2 droid with JSONL fallback at ~/.factory/sessions/-<cwd-dir>/<session-uuid>.jsonl plus MCP configuration via ~/.factory/mcp.json. Lifecycle hooks are not verified; platform=droid captures map through CodingAgentRuntime.droid. Promote only when an official hook surface is reproduced.",
  },
  {
    harness: "antigravity",
    wave: 3,
    hookSupport: "none",
    installedHooks: [],
    fallback: "skill+sidecar",
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

function redactObserveText(value: string): string {
  return value
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/g, "[REDACTED_TOKEN]")
    .replace(/(\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[REDACTED]");
}

function structuredFromJsonl(content: string): {
  decisions: string[];
  outcomes: string[];
  errors: string[];
  commands: string[];
  files: string[];
  entities: string[];
  verification: Array<{ command: string; status: string; exitCode?: number }>;
  events: Array<{ role: string; text: string }>;
} {
  const decisions: string[] = [];
  const outcomes: string[] = [];
  const errors: string[] = [];
  const commands: string[] = [];
  const files: string[] = [];
  const entities: string[] = [];
  const verification: Array<{ command: string; status: string; exitCode?: number }> = [];
  const events: Array<{ role: string; text: string }> = [];
  const seen = (items: string[], value: string) => {
    const clean = redactObserveText(value).replace(/\s+/g, " ").trim().slice(0, 600);
    if (clean && !items.includes(clean) && items.length < 40) items.push(clean);
  };
  const lines = content.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let record: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(line) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) record = parsed as Record<string, unknown>;
    } catch {
      record = { text: line };
    }
    const role = String(record.role ?? record.type ?? record.event ?? "event");
    const text = redactObserveText(
      typeof record.text === "string"
        ? record.text
        : typeof record.content === "string"
          ? record.content
          : typeof record.message === "string"
            ? record.message
            : typeof record.output === "string"
              ? record.output
              : line
    );
    const assistant = /assistant|agent|model/i.test(role);
    if (events.length < 80 && text.trim()) events.push({ role, text: text.replace(/\s+/g, " ").slice(0, 500) });
    for (const key of ["command", "cmd", "shellCommand", "shell_command"]) {
      if (typeof record[key] === "string") seen(commands, record[key] as string);
    }
    for (const match of text.matchAll(/^\s*\$\s+(.+)$/gm)) seen(commands, match[1]);
    for (const key of ["path", "file", "filePath", "file_path", "target_file", "targetFile"]) {
      if (typeof record[key] === "string" && !String(record[key]).endsWith(".jsonl")) seen(files, String(record[key]));
    }
    for (const match of text.matchAll(/(?:edited|updated|created|modified|wrote)\s+[`']?((?:apps|src|scripts|packages|services|integrations|\.planning|docs)[^`'\s,;)]*)/gi)) seen(files, match[1]);
    for (const match of text.matchAll(/\b(?:PR|pull request|issue)\s*#?\d+|(?:^|\s)#\d+\b/gi)) seen(entities, match[0]);
    if (typeof record.repo === "string") seen(entities, `repo:${record.repo}`);
    if (typeof record.project === "string") seen(entities, `project:${record.project}`);
    if (typeof record.branch === "string") seen(entities, `branch:${record.branch}`);
    if (assistant || /\b(?:decision|decided|choose|chosen|adopt|will use)\b/i.test(text)) {
      for (const match of text.matchAll(/^\s*(?:#{1,4}\s*)?(?:decision|decided)\s*:?[ ]*(.+)$/gim)) seen(decisions, match[1]);
    }
    const rawStatus = record.exitCode ?? record.exit_code ?? record.status ?? record.outcome;
    const statusValue = String(rawStatus ?? "").toLowerCase();
    const exitCode = typeof rawStatus === "number" ? rawStatus : undefined;
    const status = exitCode !== undefined ? (exitCode === 0 ? "passed" : "failed") : /pass|success|verified|complete/.test(statusValue) ? "passed" : /fail|error|timeout/.test(statusValue) ? "failed" : "unknown";
    const command = commands.at(-1);
    if (command && /(test|lint|typecheck|build|check|verify|compile)/i.test(command) && status !== "unknown") {
      const item = { command, status, ...(exitCode === undefined ? {} : { exitCode }) };
      if (!verification.some((existing) => JSON.stringify(existing) === JSON.stringify(item)) && verification.length < 40) verification.push(item);
      seen(outcomes, `${command} — ${status}`);
    }
    if (status === "failed" || /\b(?:error|exception|stack trace|traceback|failed|failure|timeout)\b/i.test(text)) seen(errors, text);
  }
  return { decisions, outcomes, errors, commands, files, entities, verification, events };
}

export function summarizeSessionJsonl(filePath: string): {
  sessionId: string;
  summary: string;
  lineCount: number;
  decisions: string[];
  outcomes: string[];
  errors: string[];
  commands: string[];
  files: string[];
  entities: string[];
  verification: Array<{ command: string; status: string; exitCode?: number }>;
  events: Array<{ role: string; text: string }>;
} {
  const sessionId = path.basename(filePath, ".jsonl");
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return { sessionId, summary: `Session ${sessionId}`, lineCount: 0, ...structuredFromJsonl("") };
  }
  const lines = content.split(/\r?\n/).filter(Boolean);
  const structured = structuredFromJsonl(content);
  const summary = [
    ...structured.decisions.map((item) => `Decision: ${item}`),
    ...structured.outcomes.map((item) => `Outcome: ${item}`),
    ...structured.verification.map((item) => `${item.command} ${item.status}`),
    ...structured.events.slice(0, 4).map((item) => item.text),
  ].join(" ").replace(/\s+/g, " ").trim().slice(0, 600);
  return {
    sessionId,
    summary: summary || `Session ${sessionId}`,
    lineCount: lines.length,
    ...structured,
  };
}

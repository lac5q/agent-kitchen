/**
 * Strict CLI argument parser (VAL-RETR-014).
 *
 * The benchmark runner CLI must:
 *   - Refuse malformed/missing flag values (no fallthrough into the
 *     next option)
 *   - Treat `--no-write` as a deterministic boolean that fully
 *     suppresses every write
 *   - Compute the deterministic output path BEFORE evaluating
 *     any side effects
 *   - Refuse options whose names are unknown
 *
 * The parser returns a fully validated `CliCommand` value. Callers
 * that pass unparsed input directly to `run()` are blocked.
 */

import fs from "node:fs";

export interface CliCommand {
  dataset: string;
  adapter: string;
  limit: number | null;
  k: number;
  seed: number;
  noWrite: boolean;
  json: boolean;
  rerank: boolean;
  judge: boolean;
  scopeTenant: string | null;
  scopeUser: string | null;
  scopeAgent: string | null;
  scopeSpace: string | null;
  scopeLabelVisibility: string | null;
  scopeLabelPolicy: string | null;
  scopeLabelDomain: string | null;
  scopeLabelSensitivity: string | null;
  scopePurpose: string | null;
  scopeBeliefStage: string | null;
  outputDir: string;
  configOverrides: Record<string, string>;
  rawArgs: string[];
}

export interface ParseResult {
  ok: boolean;
  reason?: string;
  command?: CliCommand;
}

const DEFAULT_OUTPUT_DIR = "evals/comparative-retrieval/results";
const DEFAULT_DATASET = "memroos_public_synthetic";
const DEFAULT_ADAPTER = "lexical";
const LIVE_PURPOSES = new Set([
  "recall", "multi-search", "context-pack", "chatgpt-action", "export",
  "summary", "dispatch", "index-write", "evidence-bundle", "memory_search", "memory-promotion",
]);
const LIVE_VISIBILITIES = new Set(["private", "internal", "public_safe", "public_approved"]);
const LIVE_LABEL_POLICIES = new Set([
  "indexable", "agent_visible", "requires_redaction", "requires_human_review", "sealed",
]);
const LIVE_BELIEF_STAGES = new Set([
  "silver_candidate_claim", "gold_claim", "revoked", "superseded",
]);

export function parseCliArgs(argv: string[]): ParseResult {
  const command: CliCommand = {
    dataset: DEFAULT_DATASET,
    adapter: DEFAULT_ADAPTER,
    limit: null,
    k: 3,
    seed: 0,
    noWrite: false,
    json: false,
    rerank: false,
    judge: false,
    scopeTenant: null,
    scopeUser: null,
    scopeAgent: null,
    scopeSpace: null,
    scopeLabelVisibility: null,
    scopeLabelPolicy: null,
    scopeLabelDomain: null,
    scopeLabelSensitivity: null,
    scopePurpose: null,
    scopeBeliefStage: null,
    outputDir: DEFAULT_OUTPUT_DIR,
    configOverrides: {},
    rawArgs: [...argv],
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case "--dataset": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return {
            ok: false,
            reason: "missing_value_for_flag:--dataset",
          };
        }
        command.dataset = next;
        i += 1;
        break;
      }
      case "--limit": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return {
            ok: false,
            reason: "missing_value_for_flag:--limit",
          };
        }
        const parsed = parseInt10(next);
        if (parsed === null || parsed <= 0) {
          return {
            ok: false,
            reason: "invalid_limit:" + next,
          };
        }
        command.limit = parsed;
        i += 1;
        break;
      }
      case "--adapter": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return {
            ok: false,
            reason: "missing_value_for_flag:--adapter",
          };
        }
        command.adapter = next;
        i += 1;
        break;
      }
      case "--k": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return {
            ok: false,
            reason: "missing_value_for_flag:--k",
          };
        }
        const parsed = parseInt10(next);
        if (parsed === null || parsed <= 0) {
          return {
            ok: false,
            reason: "invalid_k:" + next,
          };
        }
        command.k = parsed;
        i += 1;
        break;
      }
      case "--seed": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return {
            ok: false,
            reason: "missing_value_for_flag:--seed",
          };
        }
        const parsed = parseInt10(next);
        if (parsed === null || parsed < 0) {
          return {
            ok: false,
            reason: "invalid_seed:" + next,
          };
        }
        command.seed = parsed;
        i += 1;
        break;
      }
      case "--no-write":
        command.noWrite = true;
        i += 1;
        break;
      case "--json":
        command.json = true;
        i += 1;
        break;
      case "--rerank":
        command.rerank = true;
        i += 1;
        break;
      case "--judge":
        command.judge = true;
        i += 1;
        break;
      case "--scope-tenant": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return {
            ok: false,
            reason: "missing_value_for_flag:--scope-tenant",
          };
        }
        command.scopeTenant = next;
        i += 1;
        break;
      }
      case "--scope-space": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return {
            ok: false,
            reason: "missing_value_for_flag:--scope-space",
          };
        }
        command.scopeSpace = next;
        i += 1;
        break;
      }
      case "--scope-user": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return { ok: false, reason: "missing_value_for_flag:--scope-user" };
        }
        command.scopeUser = next;
        i += 1;
        break;
      }
      case "--scope-agent": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return { ok: false, reason: "missing_value_for_flag:--scope-agent" };
        }
        command.scopeAgent = next;
        i += 1;
        break;
      }
      case "--scope-label-visibility": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return { ok: false, reason: "missing_value_for_flag:--scope-label-visibility" };
        }
        command.scopeLabelVisibility = next;
        i += 1;
        break;
      }
      case "--scope-label-policy": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return { ok: false, reason: "missing_value_for_flag:--scope-label-policy" };
        }
        command.scopeLabelPolicy = next;
        i += 1;
        break;
      }
      case "--scope-label-domain": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return { ok: false, reason: "missing_value_for_flag:--scope-label-domain" };
        }
        command.scopeLabelDomain = next;
        i += 1;
        break;
      }
      case "--scope-label-sensitivity": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return { ok: false, reason: "missing_value_for_flag:--scope-label-sensitivity" };
        }
        command.scopeLabelSensitivity = next;
        i += 1;
        break;
      }
      case "--scope-purpose": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return {
            ok: false,
            reason: "missing_value_for_flag:--scope-purpose",
          };
        }
        command.scopePurpose = next;
        i += 1;
        break;
      }
      case "--scope-belief-stage": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return { ok: false, reason: "missing_value_for_flag:--scope-belief-stage" };
        }
        command.scopeBeliefStage = next;
        i += 1;
        break;
      }
      case "--output-dir": {
        const next = argv[++i];
        if (next === undefined || next.startsWith("--")) {
          return {
            ok: false,
            reason: "missing_value_for_flag:--output-dir",
          };
        }
        command.outputDir = next;
        i += 1;
        break;
      }
      default: {
        if (typeof arg === "string" && arg.startsWith("--")) {
          return {
            ok: false,
            reason: "unknown_flag:" + arg,
          };
        }
        // positional arguments are not accepted.
        i += 1;
      }
    }
  }

  if (command.adapter === "live") {
    const required = [
      command.scopeTenant,
      command.scopeUser,
      command.scopeAgent,
      command.scopeSpace,
      command.scopeLabelVisibility,
      command.scopeLabelPolicy,
      command.scopePurpose,
      command.scopeBeliefStage,
    ];
    if (required.some((value) => value === null || value.length === 0)) {
      return { ok: false, reason: "incomplete_live_scope" };
    }
    if (!LIVE_PURPOSES.has(command.scopePurpose!)) {
      return { ok: false, reason: "invalid_purpose" };
    }
    if (
      !LIVE_VISIBILITIES.has(command.scopeLabelVisibility!) ||
      !LIVE_LABEL_POLICIES.has(command.scopeLabelPolicy!) ||
      !LIVE_BELIEF_STAGES.has(command.scopeBeliefStage!)
    ) {
      return { ok: false, reason: "invalid_live_scope" };
    }
  }

  return { ok: true, command };
}

function parseInt10(text: string): number | null {
  if (!/^-?\d+$/.test(text)) return null;
  const value = parseInt(text, 10);
  if (!Number.isFinite(value)) return null;
  return value;
}

// ---------------------------------------------------------------------------
// No-write enforcement (VAL-RETR-014)
// ---------------------------------------------------------------------------

export interface WriteAttempt {
  path: string;
  bytes: number;
  reason: string;
}

export interface WriteGuard {
  armed: boolean;
  attempts: WriteAttempt[];
  allow(args: { path: string; reason: string; bytes?: number }): boolean;
  /**
   * Throws if the no-write flag is armed; otherwise records the attempt
   * and returns. Use `allow` for a non-throwing variant.
   */
  ensureWritable(args: { path: string; reason: string }): void;
}

export function createWriteGuard(noWrite: boolean): WriteGuard {
  const attempts: WriteAttempt[] = [];
  return {
    armed: noWrite,
    attempts,
    allow(args) {
      if (noWrite) {
        attempts.push({
          path: args.path,
          bytes: args.bytes ?? 0,
          reason: args.reason,
        });
        return false;
      }
      return true;
    },
    ensureWritable(args) {
      if (noWrite) {
        throw new Error(
          "no_write_blocked: " + args.path + " (reason=" + args.reason + ")",
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Deterministic output path control (VAL-RETR-014)
// ---------------------------------------------------------------------------

export function canonicalReportPath(args: {
  resultsDir: string;
  dataset: string;
  adapter: string;
  lane: string;
  extension: "json" | "md";
}): string {
  const ext = args.extension;
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const filename =
    safe(args.dataset) +
    "-" +
    safe(args.adapter) +
    "-" +
    safe(args.lane) +
    "-latest." +
    ext;
  return args.resultsDir.replace(/\/+$/, "") + "/" + filename;
}

export function previewSnapshot(args: { paths: string[] }): { ok: boolean; exists: string[] } {
  const exists: string[] = [];
  for (const p of args.paths) {
    if (fs.existsSync(p)) exists.push(p);
  }
  return { ok: exists.length === 0, exists };
}

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
  scopeSpace: string | null;
  scopePurpose: string | null;
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
    scopeSpace: null,
    scopePurpose: null,
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

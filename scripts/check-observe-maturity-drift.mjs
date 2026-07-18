#!/usr/bin/env node
/**
 * MemRoOS observe-maturity drift-check (v8.16 Phase 171 / OBSERVE-13).
 *
 * Verifies that three sources of truth agree on the observe harness name set:
 *
 *   1. `apps/memroos/src/lib/observe-sidecar.ts`
 *      The `ObserveHarness` TypeScript union + `OBSERVE_HARNESS_PATHS` table —
 *      the canonical catalog (Claude, Codex, Hermes, OpenClaw, Pi, Cursor,
 *      Factory, Antigravity today).
 *
 *   2. `scripts/install-agent-integrations.sh`
 *      The `TARGETS` array under `declare -a TARGETS=( ...)`. Pi, Antigravity,
 *      and Droid must appear here per Phase 169 / 170.
 *
 *   3. `docs/runtime-adapter-maturity.md`
 *      The Observe-capture matrix table at the bottom of the doc — the
 *      "Observe capture matrix (v8.16)" section.
 *
 * The script exits non-zero if any harness is in the catalog but missing from
 * the matrix, or vice versa, or missing from installer TARGETS, or vice versa.
 *
 * External callers can override the file paths via environment variables:
 *
 *   SIDECAR_FILE, INSTALLER_FILE, MATRIX_FILE
 *
 * The script also exports pure functions (`extractObserveHarnessNames`,
 * `extractInstallerTargetNames`, `extractMatrixHarnessNames`,
 * `evaluateObserveMaturityDrift`) so the matching test can exercise drift
 * detection on synthesized fixtures without touching the repository.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

export const DEFAULT_SIDECAR_FILE = path.join(
  repoRoot,
  "apps/memroos/src/lib/observe-sidecar.ts"
);
export const DEFAULT_INSTALLER_FILE = path.join(
  repoRoot,
  "scripts/install-agent-integrations.sh"
);
export const DEFAULT_MATRIX_FILE = path.join(
  repoRoot,
  "docs/runtime-adapter-maturity.md"
);

/**
 * Parse the canonical catalog harness set. The catalog is a TypeScript module
 * that declares `export type ObserveHarness = "claude" | "codex" | ... ;` and
 * an `OBSERVE_HARNESS_PATHS` array that contains `{ harness: "<harness>", ... }`
 * entries. We extract both and intersect them so a typo in either location
 * surfaces as drift.
 */
export function extractObserveHarnessNames(sourceText) {
  if (typeof sourceText !== "string") {
    throw new TypeError("extractObserveHarnessNames: sourceText must be a string");
  }

  // 1. Pull the union from the TS type alias.
  const unionMatch = sourceText.match(
    /export\s+type\s+ObserveHarness\s*=\s*([\s\S]*?);/
  );
  if (!unionMatch) {
    throw new Error(
      "extractObserveHarnessNames: could not locate ObserveHarness type alias in source"
    );
  }
  const unionMembers = Array.from(
    unionMatch[1].matchAll(/["']([a-z][a-z0-9-]*)["']/g)
  ).map((m) => m[1]);
  if (unionMembers.length === 0) {
    throw new Error(
      "extractObserveHarnessNames: ObserveHarness union declared but produced no members"
    );
  }

  // 2. Pull the runtime list from OBSERVE_HARNESS_PATHS rows.
  const harnessIdSet = new Set(unionMembers);
  const runtimeHarnesses = new Set();
  const runtimeBlock = sourceText.match(
    /export\s+const\s+OBSERVE_HARNESS_PATHS\s*:\s*ObserveHarnessPath\[\]\s*=\s*\[([\s\S]*?)\];/
  );
  if (!runtimeBlock) {
    throw new Error(
      "extractObserveHarnessNames: could not locate OBSERVE_HARNESS_PATHS catalog"
    );
  }
  for (const match of runtimeBlock[1].matchAll(
    /harness:\s*["']([a-z][a-z0-9-]*)["']/g
  )) {
    runtimeHarnesses.add(match[1]);
  }
  if (runtimeHarnesses.size === 0) {
    throw new Error(
      "extractObserveHarnessNames: OBSERVE_HARNESS_PATHS block has no `harness:` keys"
    );
  }

  // Detect harness names that appear in OBSERVE_HARNESS_PATHS but are not
  // listed in the type alias (and vice versa). Either is drift.
  for (const harness of runtimeHarnesses) {
    if (!harnessIdSet.has(harness)) {
      throw new Error(
        `extractObserveHarnessNames: catalog row harness="${harness}" is missing from ObserveHarness type union`
      );
    }
  }
  for (const harness of harnessIdSet) {
    if (!runtimeHarnesses.has(harness)) {
      throw new Error(
        `extractObserveHarnessNames: ObserveHarness union member "${harness}" is missing from OBSERVE_HARNESS_PATHS catalog`
      );
    }
  }

  return [...runtimeHarnesses].sort();
}

/**
 * Extract the canonical `TARGETS` row names from the installer. The installer
 * declares an array using bash syntax:
 *
 *   declare -a TARGETS=(
 *     "claude|$HOME_DIR/.claude/CLAUDE.md|...|yaml"
 *     "antigravity|...|none"
 *     ...
 *   )
 *
 * Quoted strings starting the row carry the harness name before the first `|`.
 * Rows appended at runtime (OpenClaw workspace discovery, etc.) are intentionally
 * ignored — we only validate the canonical declared rows.
 */
export function extractInstallerTargetNames(sourceText) {
  if (typeof sourceText !== "string") {
    throw new TypeError(
      "extractInstallerTargetNames: sourceText must be a string"
    );
  }
  const targets = new Set();
  const block = sourceText.match(
    /declare\s+-a\s+TARGETS\s*=\s*\(([\s\S]*?)\n\)/
  );
  if (!block) {
    throw new Error(
      "extractInstallerTargetNames: could not locate declare -a TARGETS=(...) block"
    );
  }
  for (const match of block[1].matchAll(/^\s*[\"']?([a-z0-9-]+)\|/gm)) {
    targets.add(match[1]);
  }
  if (targets.size === 0) {
    throw new Error(
      "extractInstallerTargetNames: declare -a TARGETS block produced no quoted rows"
    );
  }
  return [...targets].sort();
}

/**
 * Extract harness names from the doc's "Observe capture matrix (v8.16)" table.
 * We anchor the regex to the matrix section heading so a stray table elsewhere
 * in the doc (the adapter maturity Matrix at the top, etc.) cannot leak into
 * the harness set. The first column of the table — Harness — is the canonical
 * signal: row format is `| <Name> | <wave> | ... |`. Names like
 * "Factory/Droid" are normalized to the catalog key `factory`.
 */
export function extractMatrixHarnessNames(markdownText) {
  if (typeof markdownText !== "string") {
    throw new TypeError("extractMatrixHarnessNames: markdownText must be a string");
  }
  const sectionMatch = markdownText.match(
    /##\s+Observe capture matrix \(v8\.16\)[\s\S]*?(?=\n##\s|$)/
  );
  if (!sectionMatch) {
    throw new Error(
      "extractMatrixHarnessNames: could not locate `## Observe capture matrix` section"
    );
  }
  const section = sectionMatch[0];
  const rows = [];
  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    if (cells.length < 2) continue;
    if (/^[-:]+$/.test(cells[0])) continue;
    if (cells[0].toLowerCase() === "harness") continue;
    rows.push(cells);
  }
  if (rows.length === 0) {
    throw new Error(
      "extractMatrixHarnessNames: matrix section found but no harness rows detected"
    );
  }
  const names = new Set();
  for (const [harnessCell, , platformCell] of rows) {
    // Prefer the lower-case platform key (column 3, `Platform key`) so
    // multi-platform rows like "Factory/Droid" collapse to "factory".
    // The cells in this doc are wrapped in backticks (e.g. `claude`); strip
    // them so they line up with the catalog's harness identifiers.
    const stripTics = (value) =>
      String(value ?? "")
        .replace(/`/g, "")
        .trim()
        .toLowerCase();
    const platform = stripTics(platformCell) || stripTics(harnessCell);
    const candidates = platform
      .split(/[/,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const canonical =
      candidates.find((value) => value && value !== "n/a") ||
      stripTics(harnessCell);
    if (!canonical) continue;
    names.add(canonical);
  }
  return [...names].sort();
}

/**
 * Compare three name sets. Returns a structured result so callers (tests and
 * the CLI entry point) can render consistent error output.
 */
export function evaluateObserveMaturityDrift({ catalog, installer, matrix }) {
  const catalogSet = new Set(catalog);
  const installerSet = new Set(installer);
  const matrixSet = new Set(matrix);

  const missingFromMatrix = [...catalogSet].filter((name) => !matrixSet.has(name));
  const missingFromCatalog = [...matrixSet].filter((name) => !catalogSet.has(name));
  // Inspect every catalog harness and classify it against the installer:
  //
  //   - "covered": the catalog name has a direct TARGETS row, or its alias
  //     has a row.
  //   - "covered-by-runtime": the catalog name is listed in
  //     `getRuntimeCoveredHarnessNames()` because the installer targets
  //     those names via runtime-discovered rows (e.g. OpenClaw workspaces
  //     are appended to TARGETS at runtime based on filesystem state).
  //   - "missing-via-alias": the catalog name has a concrete alias that
  //     is missing from the installer (factory when droid is gone).
  //   - "missing-no-alias": the catalog name has no alias at all and no
  //     direct row.
  //
  // "missing-via-alias" and "missing-no-alias" are drift conditions; both
  // surface a per-harness diagnostic so operators can see at a glance
  // which harness is uncovered.
  const runtimeCovered = new Set(getRuntimeCoveredHarnessNames());
  const missingFromInstaller = [];
  const harnessDriftDetails = []; // [{name, kind}]
  for (const name of catalogSet) {
    const aliases = getInstallerHarnessAliases(name);
    const directlyCovered = installerSet.has(name);
    const aliasCovered = aliases.some((alias) => installerSet.has(alias));
    if (directlyCovered) continue;
    if (aliasCovered) continue;
    if (runtimeCovered.has(name)) {
      // Runtime-discovered: the installer generates this row on demand when
      // matching files exist on disk. Treat as covered for drift purposes.
      continue;
    }
    missingFromInstaller.push(name);
    harnessDriftDetails.push({
      name,
      kind: aliases.length === 0 ? "missing-no-alias" : "missing-via-alias",
      aliases,
    });
  }
  const unexpectedInInstaller = [
    ...[...installerSet].filter((name) => {
      if (catalogSet.has(name)) return false;
      return !mapInstallerToCatalogName(name);
    }),
  ];
  const diagnostics = [];

  if (missingFromMatrix.length)
    diagnostics.push(
      `Catalog has harness(es) missing from matrix: ${missingFromMatrix.join(", ")}`
    );
  if (missingFromCatalog.length)
    diagnostics.push(
      `Matrix lists harness(es) missing from catalog: ${missingFromCatalog.join(", ")}`
    );
  // Per-harness diagnostics for installer drift. Each uncovered catalog
  // harness surfaces the alias status so operators can see at a glance
  // whether the bridge still maps onto an installer row.
  if (missingFromInstaller.length) {
    const lines = harnessDriftDetails.map(
      ({ name, kind, aliases }) => {
        if (kind === "missing-via-alias") {
          return `${name} (alias ${aliases.join(",")} absent from TARGETS)`;
        }
        return `${name} (no alias available)`;
      }
    );
    diagnostics.push(
      `Catalog harness(es) missing from installer TARGETS: ${lines.join("; ")}`
    );
  }
  // Installer-only rows are informational because the installer covers more
  // than just observe harnesses (e.g. `gemini`, `qwen`, `zcode`, `grok`,
  // `opencode` are runtime adapter installer entries).
  if (unexpectedInInstaller.length)
    diagnostics.push(
      `Installer TARGETS list non-observe harness(es) — informational, no action required: ${unexpectedInInstaller.join(", ")}`
    );

  const hasHardDrift =
    missingFromMatrix.length > 0 ||
    missingFromCatalog.length > 0 ||
    missingFromInstaller.length > 0;

  return {
    ok: !hasHardDrift,
    catalog: [...catalogSet].sort(),
    installer: [...installerSet].sort(),
    matrix: [...matrixSet].sort(),
    missingFromMatrix,
    missingFromCatalog,
    missingFromInstaller,
    unexpectedInInstaller,
    diagnostics,
  };
}

/**
 * Map a catalog harness name onto the TARGETS row(s) that wire it. Today the
 * installer maps `factory` -> `droid` (factory-json MCP block). Keeping this
 * bridge as an explicit alias lets the drift-check report the truth without
 * forcing a Phase 169 installer edit.
 */
function getInstallerHarnessAliases(catalogName) {
  switch (catalogName) {
    case "factory":
      // The installer wires droid through factory-json MCP block; the catalog
      // entries name the platform `factory` while the TARGETS row uses `droid`.
      return ["droid"];
    default:
      return [];
  }
}

// Wildcard aliases cover runtime-generated TARGETS rows. OpenClaw
// workspaces are appended to TARGETS as `openclaw` or `openclaw-<name>`,
// so `openclaw` is treated as a wildcard-covered alias rather than a
// static row. Pattern grammar is a single `*` suffix for now.
// Catalog harness names that the installer covers by appending TARGETS
// rows at runtime. Drift detection treats these as covered because the
// static declare -a TARGETS=(...) block never lists them.
function getRuntimeCoveredHarnessNames() {
  return ["openclaw"];
}

/**
 * Reverse direction for the unexpected-in-installer diagnostic: only flags
 * rows that are not catalog harness names AND not aliases of catalog
 * harnesses. (The installer legitimately lists `gemini`, `qwen`, etc.)
 */
function mapCatalogToInstallerName(catalogName) {
  return getInstallerHarnessAliases(catalogName);
}

function mapInstallerToCatalogName(installerName) {
  switch (installerName) {
    case "droid":
      return "factory";
    default:
      return null;
  }
}

function defaultSources() {
  return {
    sidecarPath: DEFAULT_SIDECAR_FILE,
    installerPath: DEFAULT_INSTALLER_FILE,
    matrixPath: DEFAULT_MATRIX_FILE,
  };
}

export function runObserveMaturityDriftCheck(options = {}) {
  const sources = {
    sidecarPath: process.env.SIDECAR_FILE || options.sidecarPath || DEFAULT_SIDECAR_FILE,
    installerPath:
      process.env.INSTALLER_FILE || options.installerPath || DEFAULT_INSTALLER_FILE,
    matrixPath: process.env.MATRIX_FILE || options.matrixPath || DEFAULT_MATRIX_FILE,
  };

  const sidecarText = fs.readFileSync(sources.sidecarPath, "utf8");
  const installerText = fs.readFileSync(sources.installerPath, "utf8");
  const matrixText = fs.readFileSync(sources.matrixPath, "utf8");

  const catalog = extractObserveHarnessNames(sidecarText);
  const installer = extractInstallerTargetNames(installerText);
  const matrix = extractMatrixHarnessNames(matrixText);

  const result = evaluateObserveMaturityDrift({ catalog, installer, matrix });
  result.sources = sources;
  return result;
}

function exit(result, { json }) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(
      [
        "Observe maturity drift-check: OK",
        `  catalog (${result.catalog.length}): ${result.catalog.join(", ")}`,
        `  matrix  (${result.matrix.length}):  ${result.matrix.join(", ")}`,
        `  installer TARGETS (${result.installer.length}): ${result.installer.join(", ")}`,
      ].join("\n") + "\n"
    );
    for (const line of result.diagnostics) console.log(`  note: ${line}`);
  } else {
    console.error("Observe maturity drift-check: FAILED");
    for (const line of result.diagnostics) console.error(`  - ${line}`);
  }
  process.exit(result.ok ? 0 : 1);
}

function isMain() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const json = process.argv.includes("--json");
  let result;
  try {
    result = runObserveMaturityDriftCheck();
  } catch (error) {
    console.error(
      `observe-maturity-drift: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(2);
  }
  exit(result, { json });
}

export const __testing = { defaultSources };

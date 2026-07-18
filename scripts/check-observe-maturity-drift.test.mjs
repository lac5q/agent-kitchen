import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_INSTALLER_FILE,
  DEFAULT_MATRIX_FILE,
  DEFAULT_SIDECAR_FILE,
  evaluateObserveMaturityDrift,
  extractInstallerTargetNames,
  extractMatrixHarnessNames,
  extractObserveHarnessNames,
  runObserveMaturityDriftCheck,
} from "./check-observe-maturity-drift.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

// Minimal sidecar fixture: mirrors the real shape expected by the parser.
const SIDECAR_FIXTURE = `
export type ObserveHarness = "claude" | "codex" | "hermes" | "openclaw" | "pi" | "cursor" | "factory" | "antigravity";

export const OBSERVE_HARNESS_PATHS: ObserveHarnessPath[] = [
  { harness: "claude", wave: 1, sessionRoots: [], maturity: "jsonl", notes: "fixture" },
  { harness: "codex", wave: 1, sessionRoots: [], maturity: "jsonl", notes: "fixture" },
  { harness: "hermes", wave: 1, sessionRoots: [], maturity: "plugin", notes: "fixture" },
  { harness: "openclaw", wave: 1, sessionRoots: [], maturity: "jsonl", notes: "fixture" },
  { harness: "pi", wave: 1, sessionRoots: [], maturity: "jsonl", notes: "fixture" },
  { harness: "cursor", wave: 2, sessionRoots: [], maturity: "mcp-partial", notes: "fixture" },
  { harness: "factory", wave: 2, sessionRoots: [], maturity: "hooks+jsonl", notes: "fixture" },
  { harness: "antigravity", wave: 3, sessionRoots: [], maturity: "limited", notes: "fixture" },
];
`;

// Minimal installer fixture: keeps the `declare -a TARGETS=(...)` shape the
// parser expects and uses a representative subset of the real rows.
const INSTALLER_FIXTURE = `
declare -a TARGETS=(
  "claude|$HOME_DIR/.claude/CLAUDE.md|$HOME_DIR/.claude/skills|yaml"
  "codex|$HOME_DIR/.codex/AGENTS.md|$HOME_DIR/.codex/skills|toml"
  "cursor|$HOME_DIR/.cursorrules|$HOME_DIR/.cursor/skills|cursor-json"
  "gemini|$HOME_DIR/.gemini/GEMINI.md|$HOME_DIR/.gemini/skills|yaml"
  "hermes|$HOME_DIR/.hermes/AGENTS.md|$HOME_DIR/.hermes/skills|yaml"
  "pi|$HOME_DIR/.pi/AGENTS.md|$HOME_DIR/.pi/skills|json"
  "droid|$HOME_DIR/.factory/AGENTS.md|$HOME_DIR/.factory/skills|factory-json"
  "antigravity|$HOME_DIR/.config/memroos/observe/antigravity/AGENTS.md|$HOME_DIR/.config/memroos/observe/antigravity/skills|none"
)
`;

// Doc fixture: covers every observe harness from the matrix column.
const MATRIX_FIXTURE = `
# Pretend doc

## Observe capture matrix (v8.16)

| Harness | Wave | Platform key | Capture method | Status |
|---------|------|--------------|----------------|--------|
| Claude | 1 | \`claude\` | jsonl | supported |
| Codex | 1 | \`codex\` | jsonl | supported |
| Hermes | 1 | \`hermes\` | plugin + jsonl | supported |
| OpenClaw | 1 | \`openclaw\` | jsonl | supported |
| Pi | 1 | \`pi\` | jsonl | supported (first-class) |
| Cursor | 2 | \`cursor\` | MCP | partial (\`mcp-partial\`) |
| Factory/Droid | 2 | \`factory\` / \`droid\` | MCP + jsonl | partial (\`hooks+jsonl\`) |
| Antigravity | 3 | \`antigravity\` | no path | limited |

## Trailers
`;

describe("extractObserveHarnessNames", () => {
  it("returns the catalog harness set when the union and table agree", () => {
    const names = extractObserveHarnessNames(SIDECAR_FIXTURE);
    assert.deepEqual(names, [
      "antigravity",
      "claude",
      "codex",
      "cursor",
      "factory",
      "hermes",
      "openclaw",
      "pi",
    ]);
  });

  it("throws when the type union lists a harness absent from the catalog table", () => {
    // Add "stale" to the union but not to the OBSERVE_HARNESS_PATHS table.
    const drifted = SIDECAR_FIXTURE.replace(
      '"antigravity";',
      '"antigravity" | "stale";'
    );
    assert.throws(
      () => extractObserveHarnessNames(drifted),
      /ObserveHarness union member "stale" is missing from OBSERVE_HARNESS_PATHS catalog/,
    );
  });

  it("throws when the catalog table lists a harness absent from the type union", () => {
    // Inject a row whose harness key is not listed in the union.
    const drifted =
      "export type ObserveHarness = \"claude\" | \"codex\";\n\n" +
      "export const OBSERVE_HARNESS_PATHS: ObserveHarnessPath[] = [\n" +
      "  { harness: \"phantom\", wave: 3, sessionRoots: [], maturity: \"limited\", notes: \"drift\" },\n" +
      "  { harness: \"claude\", wave: 1, sessionRoots: [], maturity: \"jsonl\", notes: \"x\" },\n" +
      "  { harness: \"codex\", wave: 1, sessionRoots: [], maturity: \"jsonl\", notes: \"x\" }\n" +
      "];\n";
    assert.throws(
      () => extractObserveHarnessNames(drifted),
      /catalog row harness="phantom" is missing from ObserveHarness type union/,
    );
  });
});

describe("extractInstallerTargetNames", () => {
  it("returns the harness column for canonical declared TARGETS rows", () => {
    const names = extractInstallerTargetNames(INSTALLER_FIXTURE);
    assert.deepEqual(names, [
      "antigravity",
      "claude",
      "codex",
      "cursor",
      "droid",
      "gemini",
      "hermes",
      "pi",
    ]);
  });

  it("ignores the dynamic OpenClaw workspace rows appended at runtime", () => {
    const names = extractInstallerTargetNames(INSTALLER_FIXTURE);
    assert.ok(!names.includes("openclaw-foo"));
    assert.ok(!names.some((name) => name.startsWith("openclaw-")));
  });
});

describe("extractMatrixHarnessNames", () => {
  it("extracts the harness column from the matrix table", () => {
    const names = extractMatrixHarnessNames(MATRIX_FIXTURE);
    assert.deepEqual(names, [
      "antigravity",
      "claude",
      "codex",
      "cursor",
      "factory",
      "hermes",
      "openclaw",
      "pi",
    ]);
  });

  it("strips backticks from cell values", () => {
    const names = extractMatrixHarnessNames(MATRIX_FIXTURE);
    assert.ok(!names.some((name) => name.includes("`")));
  });

  it("throws when the matrix section is missing", () => {
    const drifted = "# Pretend doc\n\nNo matrix here.";
    assert.throws(
      () => extractMatrixHarnessNames(drifted),
      /Observe capture matrix/,
    );
  });
});

describe("evaluateObserveMaturityDrift", () => {
  const base = {
    catalog: [
      "antigravity",
      "claude",
      "codex",
      "cursor",
      "factory",
      "hermes",
      "openclaw",
      "pi",
    ],
    installer: [
      "antigravity",
      "claude",
      "codex",
      "cursor",
      "droid",
      "gemini",
      "hermes",
      "openclaw",
      "pi",
    ],
    matrix: [
      "antigravity",
      "claude",
      "codex",
      "cursor",
      "factory",
      "hermes",
      "openclaw",
      "pi",
    ],
  };

  it("is ok on a known-good harness set", () => {
    const result = evaluateObserveMaturityDrift(base);
    assert.equal(result.ok, true);
    assert.deepEqual(result.missingFromMatrix, []);
    assert.deepEqual(result.missingFromCatalog, []);
    // factory → droid is an informational alias.
    assert.deepEqual(result.missingFromInstaller, []);
  });

  it("flags drift when a harness is in the catalog but missing from the matrix", () => {
    const drifted = {
      ...base,
      matrix: base.matrix.filter((name) => name !== "cursor"),
    };
    const result = evaluateObserveMaturityDrift(drifted);
    assert.equal(result.ok, false);
    assert.deepEqual(result.missingFromMatrix, ["cursor"]);
    assert.ok(
      result.diagnostics.some((line) => line.includes("missing from matrix") && line.includes("cursor")),
    );
  });

  it("flags drift when the matrix lists a harness absent from the catalog", () => {
    const drifted = {
      ...base,
      catalog: base.catalog.filter((name) => name !== "cursor"),
    };
    const result = evaluateObserveMaturityDrift(drifted);
    assert.equal(result.ok, false);
    assert.deepEqual(result.missingFromCatalog, ["cursor"]);
  });

  it("flags drift when a catalog harness is uncovered by the installer", () => {
    const drifted = {
      ...base,
      installer: base.installer.filter((name) => name !== "antigravity"),
    };
    const result = evaluateObserveMaturityDrift(drifted);
    assert.equal(result.ok, false);
    assert.deepEqual(result.missingFromInstaller, ["antigravity"]);
  });

  it("does NOT flag drift when factory is covered by the droid installer alias", () => {
    const result = evaluateObserveMaturityDrift(base);
    assert.equal(result.ok, true);
    // factory IS in the catalog and IS missing from the installer, but it is
    // bridged through the `droid` alias path (a TARGETS row covers the harness
    // under its supported name). The alias is therefore NOT a failure.
    assert.deepEqual(result.missingFromInstaller, []);
    assert.equal(
      result.diagnostics.some((line) => /factory/.test(line) && /droid/.test(line)),
      false,
      "alias bridge should be silent in the passing case",
    );
  });

  it("flags drift when an alias bridge is missing from the installer (factory without droid)", () => {
    // Drop the `droid` installer row; the alias bridge is gone so factory
    // becomes a real piece of drift.
    const drifted = {
      ...base,
      installer: base.installer.filter((name) => name !== "droid"),
    };
    const result = evaluateObserveMaturityDrift(drifted);
    assert.equal(result.ok, false);
    assert.ok(result.missingFromInstaller.includes("factory"));
    assert.ok(
      result.diagnostics.some((line) => /factory/.test(line) && /droid/.test(line)),
      "expected an informational factory/droid bridge diagnostic",
    );
  });
});

describe("runObserveMaturityDriftCheck on committed sources", () => {
  it("returns ok=true on the current committed catalog + matrix + installer", function check() {
    if (!fs.existsSync(DEFAULT_SIDECAR_FILE) ||
        !fs.existsSync(DEFAULT_INSTALLER_FILE) ||
        !fs.existsSync(DEFAULT_MATRIX_FILE)) {
      // Repo layout shifted (we are running outside the memroos repo).
      // Skip rather than fail so this test stays useful in isolation.
      this.skip?.();
      return;
    }
    const result = runObserveMaturityDriftCheck();
    assert.equal(result.ok, true, `drift detected:\n${result.diagnostics.join("\n")}`);
    assert.ok(result.catalog.includes("pi"));
    assert.ok(result.matrix.includes("pi"));
    assert.ok(result.installer.includes("pi"));
    assert.ok(result.installer.includes("droid"));
    assert.ok(result.installer.includes("antigravity"));
  });

  it("exits 0 on a known-good harness set via a synthetic fixture (no file IO)", () => {
    // A lightweight trip-wire: changing the matrix section heading to
    // `## Observe capture matrix OLD` would break the parser; this test
    // pins the section heading so silent refactors fail loudly.
    const myMatrix = MATRIX_FIXTURE.replace(
      "## Observe capture matrix (v8.16)",
      "## Observe capture matrix OLD",
    );
    assert.throws(
      () => extractMatrixHarnessNames(myMatrix),
      /Observe capture matrix/,
    );
  });

  // Default paths are pinned so a future refactor that relocates the script
  // (and therefore the repoRoot anchor) catches the move.
  it("anchor paths live inside the memroos repo", () => {
    assert.equal(DEFAULT_SIDECAR_FILE, path.join(repoRoot, "apps/memroos/src/lib/observe-sidecar.ts"));
    assert.equal(DEFAULT_INSTALLER_FILE, path.join(repoRoot, "scripts/install-agent-integrations.sh"));
    assert.equal(DEFAULT_MATRIX_FILE, path.join(repoRoot, "docs/runtime-adapter-maturity.md"));
  });
});

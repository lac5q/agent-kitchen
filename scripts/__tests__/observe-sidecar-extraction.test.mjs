import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { summarizeSessionJsonl } from "../run-observe-sidecar.mjs";

test("structured extraction v2 captures decisions, verification, errors, commands, files, and entities", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-observe-v2-"));
  const file = path.join(root, "fixture-session.jsonl");
  fs.writeFileSync(file, [
    JSON.stringify({ type: "session_start", repo: "memroos-product", branch: "phase-192" }),
    JSON.stringify({ role: "assistant", content: "## Decision: keep capture depth relevant by default and use the sidecar." }),
    JSON.stringify({ type: "tool_call", name: "Bash", input: { command: "npm test -- --run" } }),
    JSON.stringify({ type: "tool_result", exitCode: 0, output: "Tests passed" }),
    JSON.stringify({ type: "tool_call", name: "Edit", input: { file_path: "scripts/run-observe-sidecar.mjs" } }),
    JSON.stringify({ type: "tool_result", exitCode: 1, stderr: "Error: timeout while posting capture; api_key=sk-this-must-not-leak" }),
    JSON.stringify({ role: "assistant", content: "Verified PR #192 remains bounded." }),
  ].join("\n") + "\n");

  const summary = summarizeSessionJsonl(file);
  assert.equal(summary.sessionId, "fixture-session");
  assert.equal(summary.lineCount, 7);
  assert.ok(summary.decisions.some((item) => item.includes("keep capture depth relevant")));
  assert.ok(summary.commands.some((item) => item.includes("npm test")));
  assert.ok(summary.files.includes("scripts/run-observe-sidecar.mjs"));
  assert.ok(summary.entities.some((item) => item.includes("PR #192")));
  assert.ok(summary.verification.some((item) => item.command.includes("npm test") && item.status === "passed"));
  assert.ok(summary.errors.some((item) => item.includes("timeout")));
  assert.ok(!JSON.stringify(summary).includes("sk-this-must-not-leak"));
  assert.ok(summary.summary.length <= 600);

  fs.rmSync(root, { recursive: true, force: true });
});

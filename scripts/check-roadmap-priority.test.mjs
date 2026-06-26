import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve("scripts/check-roadmap-priority.mjs");
const rankedPlan = `# GSD Roadmap Prioritization

1. **Phase 115 trust-boundary hardening (\`ARCHREV-01\`, \`ARCHREV-09\`, \`ARCHREV-10\`)**
2. **Phase 115 runtime and config hardening (\`ARCHREV-04\`, \`ARCHREV-05\`)**
3. **Public evidence refresh**
4. **Phase 117 NOC efficiency telemetry (\`EFFTEL-01\`..\`EFFTEL-05\`)**
5. **Bounded research spikes**

Spike-first: keep deferred work gated.
`;

function makeRepo(requirements) {
  const root = mkdtempSync(path.join(tmpdir(), "roadmap-priority-"));
  mkdirSync(path.join(root, ".planning/notes"), { recursive: true });
  writeFileSync(path.join(root, ".planning/REQUIREMENTS.md"), requirements);
  writeFileSync(path.join(root, ".planning/notes/2026-06-19-gsd-roadmap-prioritization.md"), rankedPlan);
  return root;
}

test("passes when active steps are incomplete and spikes stay deferred", () => {
  const root = makeRepo(`
- [ ] **ARCHREV-01**: Route hardening.
- [ ] **EFFTEL-01**: Retrieval telemetry.
- **MEMGEN-FOLLOWUP-02**: Run a bounded Memento spike; no dependency adoption without Luis approval.
`);

  const output = execFileSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });

  assert.match(output, /Roadmap priority gate passed/);
});

test("fails when a spike is approved before active steps are complete", () => {
  const root = makeRepo(`
- [ ] **ARCHREV-01**: Route hardening.
- [ ] **EFFTEL-01**: Retrieval telemetry.
- [x] **FASTCONTEXT-FOLLOWUP-01**: approved repo-scout spike.
`);

  assert.throws(
    () => execFileSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8", stdio: "pipe" }),
    /Spike requirements cannot be approved/,
  );
});

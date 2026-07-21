import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import { computedManifestHash } from "../check-runtime-bottleneck-evidence.mjs";
import { buildManifest, writeManifest } from "../generate-runtime-bottleneck-manifest.mjs";

function write(dir, name, value) { const file = path.join(dir, name); fs.writeFileSync(file, value); return file; }

describe("runtime suite manifest generator", () => {
  it("derives hashes and host/runtime metadata without hand-authored values", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-manifest-"));
    try {
      const fixture = [{ id: "task-1", dataset: "memroos_public_synthetic", task_type: "single_hop", corpus: [{ id: "doc-1", text: "hello" }], question: "hello?", expected_answer: "hello", evidence_spans: [] }];
      const retrievalConfig = { dataset: "memroos_public_synthetic", adapter: "lexical", k: 3, rerankEnabled: false, judgeEnabled: false, providerFlags: { embedding: false, vector_backend: false, rerank: false, judge: false, external_mcp: false }, seed: 175 };
      const args = {
        fixture: write(dir, "fixture.json", JSON.stringify(fixture, null, 2) + "\n"), operatorWorkload: write(dir, "operator.json", JSON.stringify({ agents: 5, writesPerHour: 1000, durationSeconds: 300 })), retrievalWorkload: write(dir, "retrieval.json", JSON.stringify({ dataset: "memroos_public_synthetic", taskCount: 25 })),
        operatorConfiguration: write(dir, "operator-config.json", JSON.stringify({ targetUrl: "https://operator.example.test/api/operations/noc", requestMethod: "GET" })), retrievalConfiguration: write(dir, "retrieval-config.json", JSON.stringify(retrievalConfig, null, 2) + "\n"), dependencyHealth: write(dir, "health.json", JSON.stringify({ sqlite: "healthy" })),
        targetUrl: "https://operator.example.test/api/operations/noc",
      };
      const manifest = buildManifest(args);
      const fixtureCanonical = JSON.stringify([{ ...fixture[0], corpus: [{ ...fixture[0].corpus[0], timestamp_iso: null }], abstention_correct: null }]);
      const configCanonical = JSON.stringify({ ...retrievalConfig, providerFlags: Object.fromEntries(Object.entries(retrievalConfig.providerFlags).sort(([a], [b]) => a.localeCompare(b))) });
      const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
      assert.equal(manifest.fixtureHash, digest(fixtureCanonical));
      assert.equal(manifest.retrievalConfigurationHash, digest(configCanonical));
      assert.equal(manifest.operatorRequestMethod, "GET");
      assert.equal(manifest.degradedMode, false);
      assert.equal(manifest.suiteManifestHash, computedManifestHash(manifest));
      const output = path.join(dir, "suite-manifest.json");
      writeManifest(output, manifest);
      assert.throws(() => writeManifest(output, manifest), /EEXIST/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

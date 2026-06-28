import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  loadContractManifest,
  validateContractManifest,
  validateContractArtifacts,
} from "./check-contract-manifest.mjs";

describe("contract manifest checker", () => {
  it("loads the shared MemRoOS contract manifest", () => {
    const manifest = loadContractManifest();

    assert.equal(manifest.manifestId, "memroos-contract-manifest.v1");
    assert.deepEqual(
      manifest.contracts.map((contract) => contract.id).sort(),
      ["memroos-a2a.v1", "memroos-mcp-tools.v1", "public-eval-api.v1"]
    );
  });

  it("validates the manifest structure", () => {
    const result = validateContractManifest(loadContractManifest());

    assert.deepEqual(result, { ok: true, errors: [], warnings: [] });
  });

  it("validates current contract artifact constants against the manifest", () => {
    const result = validateContractArtifacts(loadContractManifest());

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.ok(result.checked.includes("apps/memroos:public-eval-api.v1"));
    assert.ok(result.checked.includes("packages/sdk-ts:public-eval-api.v1"));
    assert.ok(result.checked.includes("packages/sdk-py:public-eval-api.v1"));
    assert.ok(result.checked.includes("services/knowledge-mcp:memroos-mcp-tools.v1"));
    assert.ok(result.checked.includes("apps/memroos:memroos-a2a.v1"));
    assert.ok(result.checked.includes("packages/sdk-ts:public-eval-api.v1:schema"));
    assert.ok(result.checked.includes("apps/memroos:memroos-a2a.v1:schema"));
  });

  it("fails when a runtime artifact drifts from the manifest contract id", () => {
    const manifest = loadContractManifest();
    const artifacts = {
      "apps/memroos/src/lib/public-api/eval-contract.ts":
        'export const PUBLIC_EVAL_API_V1_CONTRACT_ID = "public-eval-api.v2";\n' +
        'export const PUBLIC_EVAL_CONTRACT_HEADER = "X-Memroos-Contract";\n',
    };

    const result = validateContractArtifacts(manifest, { artifacts });

    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((error) =>
        error.includes("apps/memroos/src/lib/public-api/eval-contract.ts")
      )
    );
  });
});

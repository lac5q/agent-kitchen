import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getRuntimeTopologyPort,
  loadRuntimeTopologyManifest,
  validateRuntimeTopologyArtifacts,
  validateRuntimeTopologyManifest,
} from "./check-runtime-topology.mjs";

describe("runtime topology checker", () => {
  it("loads the shared runtime topology manifest JSON", () => {
    const manifest = loadRuntimeTopologyManifest();

    assert.equal(manifest.version, 1);
    assert.ok(manifest.services.some((service) => service.id === "memroos-app"));
    assert.ok(manifest.services.some((service) => service.id === "mem0-memory"));
  });

  it("validates manifests without depending on Vitest", () => {
    const manifest = loadRuntimeTopologyManifest();
    const result = validateRuntimeTopologyManifest(manifest);

    assert.deepEqual(result, { ok: true, errors: [], warnings: [] });
  });

  it("resolves declared ports by service and port id", () => {
    const manifest = loadRuntimeTopologyManifest();

    assert.equal(getRuntimeTopologyPort(manifest, "memroos-app", "local-next-http"), 3002);
    assert.equal(getRuntimeTopologyPort(manifest, "voice-server", "pipecat-health"), 7861);
    assert.throws(() => getRuntimeTopologyPort(manifest, "missing", "port"), /Unknown runtime service/);
  });

  it("reports missing runtime artifact port declarations", () => {
    const manifest = loadRuntimeTopologyManifest();
    const result = validateRuntimeTopologyArtifacts(manifest, {
      dockerComposeText: "services: {}",
      startScriptText: "NEXTJS_PORT=3002\nPIPECAT_PORT=7860\nHEALTH_PORT=7861\nAGENTMEMORY_PORT=3111\n",
      launchdStartText: "runtime_topology_port memroos-app launchd-next-http\n",
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("docker:memroos-app")));
  });

  it("validates copied current runtime artifact text", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-runtime-topology-"));
    try {
      const manifest = loadRuntimeTopologyManifest();
      const result = validateRuntimeTopologyArtifacts(manifest, {
        dockerComposeText: '${MEMROOS_PORT:-3000}:3000\n3201\n3210\n',
        startScriptText:
          "node scripts/check-runtime-topology.mjs port memroos-app local-next-http\n" +
          "node scripts/check-runtime-topology.mjs port voice-server pipecat-http\n" +
          "node scripts/check-runtime-topology.mjs port voice-server pipecat-health\n" +
          "node scripts/check-runtime-topology.mjs port agentmemory-engine agentmemory-http\n",
        launchdStartText: "runtime_topology_port memroos-app launchd-next-http\n",
      });

      assert.equal(result.ok, true);
      assert.equal(result.errors.length, 0);
      assert.ok(result.checked.includes("docker:memroos-app:MEMROOS_PORT:3000->3000"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires start.sh to derive manual-script ports from the topology checker", () => {
    const manifest = loadRuntimeTopologyManifest();
    const startScriptText = fs.readFileSync(path.resolve("start.sh"), "utf8");

    for (const service of manifest.services) {
      for (const port of service.ports ?? []) {
        if (port.requiredIn?.includes("manual-script")) {
          assert.match(startScriptText, new RegExp(`port ${service.id} ${port.id}`));
        }
      }
    }
  });

  it("requires launchd port default derive from topology checker", () => {
    const launchdStartText = fs.readFileSync(path.resolve("scripts/launchd-start.sh"), "utf8");

    assert.match(launchdStartText, /runtime_topology_port memroos-app launchd-next-http/);
    assert.doesNotMatch(launchdStartText, /^PORT="\$\{PORT:-3002\}"/m);
  });
});

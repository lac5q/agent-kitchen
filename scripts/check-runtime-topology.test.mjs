import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getRuntimeTopologyPort,
  loadRuntimeTopologyManifest,
  resolveProfile,
  validateRuntimeTopologyArtifacts,
  validateRuntimeTopologyManifest,
} from "./check-runtime-topology.mjs";

describe("runtime topology checker", () => {
  it("loads the shared runtime topology manifest JSON (v2 profile-keyed)", () => {
    const manifest = loadRuntimeTopologyManifest();
    // Phase 186 (v8.28) bumped the manifest to v2 with profiles.
    assert.equal(manifest.version, 2);
    assert.ok(manifest.profiles, "manifest must declare profiles");
    assert.ok(manifest.profiles["local-dev"], "local-dev profile is required");
    assert.ok(manifest.profiles["production"], "production profile is required (TOPOPROD-01)");
  });

  it("resolves the default profile to local-dev", () => {
    const manifest = loadRuntimeTopologyManifest();
    const profile = resolveProfile(manifest);
    assert.equal(profile.name, manifest.defaultProfile ?? "local-dev");
  });

  it("the production profile declares every required service", () => {
    const manifest = loadRuntimeTopologyManifest();
    const prod = resolveProfile(manifest, "production");
    const required = (prod.services ?? []).filter((s) => s.required !== false);
    // TOPOPROD-01 + the architecture review F2 require knowledge-mcp
    // and healthcheck in the production profile.
    const ids = new Set(required.map((s) => s.id));
    assert.ok(ids.has("memroos-app"), "memroos-app is required on oracle-1");
    assert.ok(ids.has("mem0-memory"), "mem0-memory is required on oracle-1");
    assert.ok(ids.has("knowledge-mcp"), "knowledge-mcp is required in production (TOPOPROD-01)");
    assert.ok(ids.has("healthcheck"), "healthcheck is required in production (TOPOPROD-01)");
  });

  it("validates manifests without depending on Vitest", () => {
    const manifest = loadRuntimeTopologyManifest();
    // v2 manifests have a profile-keyed schema. The local-dev profile
    // is the canonical "happy path" for the per-service validation.
    const profile = resolveProfile(manifest, "local-dev");
    const result = validateRuntimeTopologyManifest(profile);

    assert.deepEqual(result, { ok: true, errors: [], warnings: [] });
  });

  it("resolves declared ports by service and port id", () => {
    const manifest = loadRuntimeTopologyManifest();
    const profile = resolveProfile(manifest, "local-dev");

    assert.equal(getRuntimeTopologyPort(profile, "memroos-app", "local-next-http"), 3002);
    assert.equal(getRuntimeTopologyPort(profile, "voice-server", "pipecat-health"), 7861);
    assert.throws(() => getRuntimeTopologyPort(profile, "missing", "port"), /Unknown runtime service/);
  });

  it("reports missing runtime artifact port declarations", () => {
    const manifest = loadRuntimeTopologyManifest();
    const profile = resolveProfile(manifest, "local-dev");
    const result = validateRuntimeTopologyArtifacts(profile, {
      dockerComposeText: "services: {}",
      startScriptText: "NEXTJS_PORT=3002\nPIPECAT_PORT=7860\nHEALTH_PORT=7861\nAGENTMEMORY_PORT=3111\n",
      launchdStartText: "runtime_topology_port memroos-app launchd-next-http\n",
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("docker:memroos-app")));
  });

  it("requires Docker health checks to match manifest health paths", () => {
    const manifest = loadRuntimeTopologyManifest();
    const result = validateRuntimeTopologyArtifacts(manifest, {
      dockerComposeText:
        "\n  memroos:\n" +
        "    depends_on:\n" +
        "      mem0:\n" +
        "      orchestration:\n" +
        "\n  mem0:\n" +
        "\n  orchestration:\n" +
        "${MEMROOS_PORT:-3000}:3000\n" +
        "${MEM0_PORT:-3201}:3201\n" +
        "${ORCHESTRATION_PORT:-3210}:3210\n" +
        "http://127.0.0.1:3000/login\n" +
        "http://127.0.0.1:3201/health\n" +
        "http://127.0.0.1:3210/health\n",
      startScriptText:
        '"$TOPOLOGY_CHECK" port memroos-app local-next-http\n' +
        '"$TOPOLOGY_CHECK" port voice-server pipecat-http\n' +
        '"$TOPOLOGY_CHECK" port voice-server pipecat-health\n' +
        '"$TOPOLOGY_CHECK" port agentmemory-engine agentmemory-http\n',
      launchdStartText: "runtime_topology_port memroos-app launchd-next-http\n",
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("docker-health:memroos-app")));
    assert.ok(result.errors.some((error) => error.includes("http://127.0.0.1:3000/api/health")));
  });

  it("validates copied current runtime artifact text", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-runtime-topology-"));
    try {
      const manifest = loadRuntimeTopologyManifest();
      // Phase 186: v2 manifest is profile-keyed. Pass the local-dev
      // profile (v1 callers would pass the manifest directly; v2 callers
      // pass `resolveProfile(manifest, name)` so the per-service
      // validation reads the right services array).
      const profile = resolveProfile(manifest, "local-dev");
      const result = validateRuntimeTopologyArtifacts(profile, {
        dockerComposeText:
          "\n  memroos:\n" +
          "    depends_on:\n" +
          "      mem0:\n" +
          "      orchestration:\n" +
          "\n  mem0:\n" +
          "\n  orchestration:\n" +
          "\n  connmem:\n" +
          "\n  knowledge-mcp:\n" +
          "${MEMROOS_PORT:-3000}:3000\n" +
          "${MEM0_PORT:-3201}:3201\n" +
          "${ORCHESTRATION_PORT:-3210}:3210\n" +
          "${CONNMEM_PORT:-3290}:3290\n" +
          "${KNOWLEDGE_MCP_PORT:-3291}:3291\n" +
          "http://127.0.0.1:3000/api/health\n" +
          "http://127.0.0.1:3201/health\n" +
          "http://127.0.0.1:3210/health\n" +
          "http://127.0.0.1:3290/health\n" +
          "http://127.0.0.1:3291/health\n",
        startScriptText:
          '"$TOPOLOGY_CHECK" port memroos-app local-next-http\n' +
          '"$TOPOLOGY_CHECK" port voice-server pipecat-http\n' +
          '"$TOPOLOGY_CHECK" port voice-server pipecat-health\n' +
          '"$TOPOLOGY_CHECK" port agentmemory-engine agentmemory-http\n' +
          '"$TOPOLOGY_CHECK" port connmem connmem-http\n',
        launchdStartText: "runtime_topology_port memroos-app launchd-next-http\n",
      });

      assert.equal(result.ok, true);
      assert.equal(result.errors.length, 0);
      assert.ok(result.checked.includes("docker:memroos-app:MEMROOS_PORT:3000->3000"));
      assert.ok(result.checked.includes("docker:mem0-memory:MEM0_PORT:3201->3201"));
      assert.ok(result.checked.includes("docker:orchestration-service:ORCHESTRATION_PORT:3210->3210"));
      assert.ok(result.checked.some((item) => item.startsWith("docker-health:memroos-app:")));
      assert.ok(result.checked.includes("docker-service:memroos-app:memroos"));
      assert.ok(result.checked.includes("docker-depends-on:memroos-app:mem0-memory:mem0"));
      assert.ok(result.checked.includes("docker-depends-on:memroos-app:orchestration-service:orchestration"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires start.sh to derive manual-script ports from the topology checker", () => {
    const manifest = loadRuntimeTopologyManifest();
    const profile = resolveProfile(manifest, "local-dev");
    const services = profile.services;
    const startScriptText = fs.readFileSync(path.resolve("start.sh"), "utf8");

    for (const service of services) {
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

  it("production profile gate fails closed when the deploy/ tree is missing", () => {
    // The production profile requires deploy/oracle-1/systemd/*.service
    // files. A missing deploy tree must fail closed (the validator
    // returned `ok:true, checked:[]` before Phase 186's REVISE fix).
    // We pass a systemdUnitText that has only ONE unit file, with a
    // WRONG ExecStart (doesn't bring up the named docker-compose
    // service). The validator must report this as a hard error.
    // Pass the manifest (not the profile) so `isV2` is true and the
    // production branch runs.
    const manifest = loadRuntimeTopologyManifest();
    const wrongExec = `
# === memroos-app.service ===
[Unit]
Description=MemroOS memroos-app (oracle-1 production)

[Service]
ExecStart=/usr/bin/docker compose -f /home/opc/memroos/docker-compose.yml up wrong-service
`;
    const result = validateRuntimeTopologyArtifacts(
      manifest,
      {
        systemdUnitText: wrongExec,
        cloudflareTunnelText: "",
        production: true,
      },
      "production",
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.length > 0,
      `expected errors for wrong ExecStart, got: ${JSON.stringify(result.errors)}`,
    );
  });

  it("production profile gate fails when a systemd unit file does not bring up the docker-compose service", () => {
    // The validator checks that each *.service file has an ExecStart
    // matching `up <dockerComposeService>`. A unit that brings up
    // the wrong service must fail.
    const manifest = loadRuntimeTopologyManifest();
    // Build a stub systemdUnitText that has a unit file for memroos-app
    // but the ExecStart brings up the wrong service.
    const wrongExec = `
# === memroos-app.service ===
[Unit]
Description=MemroOS memroos-app (oracle-1 production)

[Service]
ExecStart=/usr/bin/docker compose -f /home/opc/memroos/docker-compose.yml up wrong-service
`;
    const result = validateRuntimeTopologyArtifacts(
      manifest,
      {
        systemdUnitText: wrongExec,
        cloudflareTunnelText: "",
        production: true,
      },
      "production",
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.includes("does not bring up memroos")),
      `expected a 'does not bring up memroos' error, got: ${JSON.stringify(result.errors)}`,
    );
  });
});

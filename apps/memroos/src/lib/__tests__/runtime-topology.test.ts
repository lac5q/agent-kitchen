import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  defaultRuntimeTopologyManifest,
  validateRuntimeTopologyArtifacts,
  validateRuntimeTopologyManifest,
} from "../runtime-topology";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("runtime topology manifest", () => {
  it("declares required services with ports, health checks, and supervision modes", () => {
    const manifest = defaultRuntimeTopologyManifest();
    const serviceIds = manifest.services.map((service) => service.id);

    expect(serviceIds).toEqual(
      expect.arrayContaining(["memroos-app", "mem0-memory", "orchestration-service"])
    );

    for (const service of manifest.services) {
      expect(service.displayName.length).toBeGreaterThan(0);
      expect(service.ports.length).toBeGreaterThan(0);
      expect(service.health).toBeDefined();
      expect(service.supervisionModes.length).toBeGreaterThan(0);
    }

    expect(validateRuntimeTopologyManifest(manifest)).toEqual({
      ok: true,
      errors: [],
      warnings: [],
    });
  });

  it("validates current Docker and startup scripts against declared port topology", () => {
    const manifest = defaultRuntimeTopologyManifest();
    const launchdStartText = fs.readFileSync(path.join(repoRoot, "scripts/launchd-start.sh"), "utf8");
    const result = validateRuntimeTopologyArtifacts(manifest, {
      dockerComposeText: fs.readFileSync(path.join(repoRoot, "docker-compose.yml"), "utf8"),
      startScriptText: fs.readFileSync(path.join(repoRoot, "start.sh"), "utf8"),
      launchdStartText,
    });

    expect(result.errors).toEqual([]);
    expect(result.checked).toEqual(
      expect.arrayContaining([
        "docker:memroos-app:MEMROOS_PORT:3000->3000",
        "docker:mem0-memory:3201",
        "docker:orchestration-service:3210",
        "script:memroos-app:NEXTJS_PORT=3002",
        "launchd:memroos-app:PORT=3002",
      ])
    );
    expect(launchdStartText).toMatch(/runtime_topology_port memroos-app launchd-next-http/);
    expect(launchdStartText).not.toMatch(/^PORT="\$\{PORT:-3002\}"/m);
  });
});

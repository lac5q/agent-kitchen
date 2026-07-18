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
        "docker:mem0-memory:MEM0_PORT:3201->3201",
        "docker:orchestration-service:ORCHESTRATION_PORT:3210->3210",
        "script:memroos-app:NEXTJS_PORT=3002",
        "launchd:memroos-app:PORT=3002",
      ])
    );
    expect(launchdStartText).toMatch(/runtime_topology_port memroos-app launchd-next-http/);
    expect(launchdStartText).not.toMatch(/^PORT="\$\{PORT:-3002\}"/m);
  });

  it("reports malformed manifests and missing artifact declarations", () => {
    const manifest = defaultRuntimeTopologyManifest();
    const invalid = {
      ...manifest,
      version: 2 as 1,
      services: [
        {
          id: "",
          displayName: "",
          required: true,
          ports: [],
          supervisionModes: [],
        },
        {
          id: "dup",
          displayName: "Duplicate",
          required: false,
          ports: [
            { id: "http", defaultPort: 0, requiredIn: ["docker-compose" as const] },
            { id: "http", defaultPort: 70000, containerPort: -1, requiredIn: ["docker-compose" as const] },
          ],
          supervisionModes: ["docker-compose" as const],
        },
        {
          id: "dup",
          displayName: "Duplicate Two",
          required: false,
          ports: [{ id: "plain", defaultPort: 5555, requiredIn: ["docker-compose" as const] }],
          supervisionModes: ["docker-compose" as const],
        },
      ],
    };

    const validation = validateRuntimeTopologyManifest(invalid);
    expect(validation.ok).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        "Unsupported runtime topology version: 2",
        "Duplicate runtime service id: dup",
        "Runtime service id is required",
        "Runtime service  displayName is required",
        "Runtime service  must declare at least one port",
        "Runtime service  must declare supervision modes",
        "Runtime service dup duplicate port id: http",
        "Runtime service dup port http has invalid defaultPort",
        "Runtime service dup port http has invalid containerPort",
      ]),
    );
    expect(validation.warnings).toContain("Required runtime service  has no health check");

    const artifacts = validateRuntimeTopologyArtifacts(invalid, { dockerComposeText: "services: {}" });
    expect(artifacts.checked).toEqual([]);
    expect(artifacts.errors).toEqual(
      expect.arrayContaining([
        "Missing docker:dup:5555: 5555",
      ]),
    );
  });
});

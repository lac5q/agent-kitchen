import { describe, expect, it } from "vitest";

import {
  defaultRuntimeTopologyManifest,
  validateRuntimeTopologyArtifacts,
  validateRuntimeTopologyManifest,
  type RuntimeService,
  type RuntimeTopologyManifest,
} from "../runtime-topology";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function minimalService(overrides: Partial<RuntimeService> = {}): RuntimeService {
  return {
    id: "memroos-app",
    displayName: "MemRoOS app",
    required: true,
    ports: [
      {
        id: "main-http",
        env: "MEMROOS_PORT",
        defaultPort: 3000,
        containerPort: 3000,
        requiredIn: ["docker-compose"],
      },
    ],
    health: { type: "http", path: "/api/health", timeoutMs: 3000 },
    supervisionModes: ["docker-compose"],
    ...overrides,
  };
}

describe("runtime-topology manifest defaults", () => {
  it("overrides the profile when one is supplied", () => {
    const local = defaultRuntimeTopologyManifest("local-dev");
    expect(local.profile).toBe("local-dev");

    const production = defaultRuntimeTopologyManifest("production");
    expect(production.profile).toBe("production");
    // services payload should be cloned, not shared with the module-level json
    const a = defaultRuntimeTopologyManifest("local-dev");
    const b = defaultRuntimeTopologyManifest("local-dev");
    a.services[0].displayName = "mutated";
    expect(b.services[0].displayName).not.toBe("mutated");
  });

  it("defaults to the local-dev profile when none is supplied", () => {
    const manifest = defaultRuntimeTopologyManifest();
    expect(manifest.profile).toBe("local-dev");
    expect(manifest.version).toBe(2);
  });

  it("throws on an unknown profile name", () => {
    expect(() =>
      defaultRuntimeTopologyManifest("docker-demo" as never),
    ).toThrow(/Unknown runtime topology profile: docker-demo/);
  });
});

describe("validateRuntimeTopologyManifest", () => {
  it("accepts the bundled manifest without errors", () => {
    const manifest = defaultRuntimeTopologyManifest();
    expect(validateRuntimeTopologyManifest(manifest)).toEqual({
      ok: true,
      errors: [],
      warnings: [],
    });
  });

  it("rejects unsupported version numbers", () => {
    const manifest = clone(defaultRuntimeTopologyManifest());
    (manifest as { version: number }).version = 3;
    const result = validateRuntimeTopologyManifest(manifest);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Unsupported runtime topology version: 3");
  });

  it("rejects duplicate service ids", () => {
    const manifest = clone(defaultRuntimeTopologyManifest());
    manifest.services.push(minimalService({ id: "memroos-app" }));
    const result = validateRuntimeTopologyManifest(manifest);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Duplicate runtime service id: memroos-app");
  });

  it("rejects services with blank id or displayName", () => {
    const manifest: RuntimeTopologyManifest = {
      version: 2,
      profile: "local-dev",
      services: [
        minimalService({ id: "   " }),
        minimalService({ id: "blank-name", displayName: "  " }),
      ],
    };
    const result = validateRuntimeTopologyManifest(manifest);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Runtime service id is required");
    expect(result.errors).toContain(
      "Runtime service blank-name displayName is required",
    );
  });

  it("allows port-less services (systemd timers) but rejects missing supervision modes", () => {
    const manifest: RuntimeTopologyManifest = {
      version: 2,
      profile: "local-dev",
      services: [
        minimalService({ id: "no-ports", ports: [] }),
        minimalService({ id: "no-modes", supervisionModes: [] }),
      ],
    };
    const result = validateRuntimeTopologyManifest(manifest);
    expect(result.errors).not.toContain("Runtime service no-ports must declare at least one port");
    expect(result.errors).toContain("Runtime service no-modes must declare supervision modes");
  });

  it("rejects duplicate port ids within a service", () => {
    const manifest: RuntimeTopologyManifest = {
      version: 2,
      profile: "local-dev",
      services: [
        minimalService({
          id: "dup-port",
          ports: [
            { id: "shared", defaultPort: 1000 },
            { id: "shared", defaultPort: 1001 },
          ],
        }),
      ],
    };
    const result = validateRuntimeTopologyManifest(manifest);
    expect(result.errors).toContain("Runtime service dup-port duplicate port id: shared");
  });

  it("rejects ports outside the legal TCP range", () => {
    const manifest: RuntimeTopologyManifest = {
      version: 2,
      profile: "local-dev",
      services: [
        minimalService({
          id: "bad-port",
          ports: [{ id: "low", defaultPort: 0 }, { id: "high", defaultPort: 70000 }],
        }),
      ],
    };
    const result = validateRuntimeTopologyManifest(manifest);
    expect(result.errors).toContain("Runtime service bad-port port low has invalid defaultPort");
    expect(result.errors).toContain("Runtime service bad-port port high has invalid defaultPort");
  });

  it("rejects containerPorts outside the legal TCP range", () => {
    const manifest: RuntimeTopologyManifest = {
      version: 2,
      profile: "local-dev",
      services: [
        minimalService({
          id: "bad-container",
          ports: [{ id: "lo", defaultPort: 1000, containerPort: 0 }],
        }),
      ],
    };
    const result = validateRuntimeTopologyManifest(manifest);
    expect(result.errors).toContain(
      "Runtime service bad-container port lo has invalid containerPort",
    );
  });

  it("warns (but keeps ok=true) when a required service lacks a health check", () => {
    const manifest: RuntimeTopologyManifest = {
      version: 2,
      profile: "local-dev",
      services: [minimalService({ id: "no-health", required: true, health: undefined })],
    };
    const result = validateRuntimeTopologyManifest(manifest);
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("Required runtime service no-health has no health check");
  });
});

describe("validateRuntimeTopologyArtifacts", () => {
  it("validates docker-compose ports, manual-script ports, and launchd ports", () => {
    const manifest: RuntimeTopologyManifest = {
      version: 2,
      profile: "local-dev",
      services: [
        minimalService({
          id: "compose-svc",
          ports: [
            {
              id: "docker-port",
              env: "COMPOSE_PORT",
              defaultPort: 1234,
              containerPort: 5678,
              requiredIn: ["docker-compose"],
            },
            {
              id: "script-port",
              env: "SCRIPT_PORT",
              defaultPort: 4321,
              requiredIn: ["manual-script"],
            },
            {
              id: "launchd-port",
              env: "LAUNCHD_PORT",
              defaultPort: 8765,
              requiredIn: ["launchd"],
            },
          ],
        }),
      ],
    };

    const dockerText = "ports:\n  - \"${COMPOSE_PORT:-1234}:5678\"\n";
    const startText = "echo port compose-svc script-port 4321\n";
    const launchdText = "echo port compose-svc launchd-port\n";

    const result = validateRuntimeTopologyArtifacts(manifest, {
      dockerComposeText: dockerText,
      startScriptText: startText,
      launchdStartText: launchdText,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.checked).toEqual([
      "docker:compose-svc:COMPOSE_PORT:1234->5678",
      "script:compose-svc:SCRIPT_PORT=4321",
      "launchd:compose-svc:LAUNCHD_PORT=8765",
    ]);
  });

  it("falls back to the raw defaultPort in docker-compose when env or containerPort is missing", () => {
    const manifest: RuntimeTopologyManifest = {
      version: 2,
      profile: "local-dev",
      services: [
        minimalService({
          id: "plain-svc",
          ports: [
            { id: "no-env", defaultPort: 9999, requiredIn: ["docker-compose"] },
          ],
        }),
      ],
    };

    const dockerText = "ports:\n  - \"9999\"\n";
    const result = validateRuntimeTopologyArtifacts(manifest, {
      dockerComposeText: dockerText,
    });

    expect(result.ok).toBe(true);
    expect(result.checked).toContain("docker:plain-svc:9999");
  });

  it("skips manual-script checks when no env is declared", () => {
    const manifest: RuntimeTopologyManifest = {
      version: 2,
      profile: "local-dev",
      services: [
        minimalService({
          id: "no-env-svc",
          ports: [{ id: "p", defaultPort: 1, requiredIn: ["manual-script"] }],
        }),
      ],
    };

    const result = validateRuntimeTopologyArtifacts(manifest, {
      startScriptText: "echo port no-env-svc p\n",
    });

    expect(result.ok).toBe(true);
    expect(result.checked).toEqual([]);
  });

  it("returns an error when the docker-compose does not declare the expected port mapping", () => {
    const manifest: RuntimeTopologyManifest = {
      version: 2,
      profile: "local-dev",
      services: [
        minimalService({
          id: "missing-svc",
          ports: [
            {
              id: "missing",
              env: "MISSING_PORT",
              defaultPort: 1111,
              containerPort: 2222,
              requiredIn: ["docker-compose"],
            },
          ],
        }),
      ],
    };

    const result = validateRuntimeTopologyArtifacts(manifest, {
      dockerComposeText: "ports:\n  - \"${OTHER_PORT:-1111}:2222\"\n",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "Missing docker:missing-svc:MISSING_PORT:1111->2222: ${MISSING_PORT:-1111}:2222",
    ]);
  });

  it("returns errors when scripts miss the manual-script or launchd port markers", () => {
    const manifest: RuntimeTopologyManifest = {
      version: 2,
      profile: "local-dev",
      services: [
        minimalService({
          id: "missing-script",
          ports: [
            {
              id: "script-port",
              env: "SCRIPT_PORT",
              defaultPort: 4321,
              requiredIn: ["manual-script"],
            },
            {
              id: "launchd-port",
              env: "LAUNCHD_PORT",
              defaultPort: 8765,
              requiredIn: ["launchd"],
            },
          ],
        }),
      ],
    };

    const result = validateRuntimeTopologyArtifacts(manifest, {
      startScriptText: "# nothing here\n",
      launchdStartText: "# nothing here either\n",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Missing script:missing-script:SCRIPT_PORT=4321: port missing-script script-port",
    );
    expect(result.errors).toContain(
      "Missing launchd:missing-script:LAUNCHD_PORT=8765: port missing-script launchd-port",
    );
  });
});

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(repoRoot, "apps/memroos/src/lib/runtime-topology.json");

// Phase 186 (v8.28 / TOPOPROD-01..02) introduced a profile-keyed schema.
// `version: 1` manifests had a flat `services` array (the local-dev
// profile). `version: 2` manifests have a `profiles` map. The loader
// normalizes both shapes: callers receive `{ profile, services }` and
// can also ask for a specific profile by name.
export function loadRuntimeTopologyManifest(filePath = manifestPath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (raw.version === 2 && raw.profiles) {
    return raw; // v2 callers select a profile via `resolveProfile(manifest, name)`.
  }
  if (raw.version === 1 && Array.isArray(raw.services)) {
    // v1 → wrap as a single local-dev profile for downstream readers.
    return {
      version: 1,
      defaultProfile: "local-dev",
      profiles: { "local-dev": { services: raw.services } },
      _comment: "auto-wrapped from v1 single-profile shape",
    };
  }
  throw new Error(`unsupported runtime-topology.json version: ${raw.version}`);
}

export function resolveProfile(manifest, name) {
  if (!manifest?.profiles) {
    throw new Error(`manifest has no profiles (version=${manifest?.version})`);
  }
  const profileName = name ?? manifest.defaultProfile ?? Object.keys(manifest.profiles)[0];
  const profile = manifest.profiles[profileName];
  if (!profile) {
    const available = Object.keys(manifest.profiles).join(", ");
    throw new Error(`unknown runtime-topology profile: ${profileName} (available: ${available})`);
  }
  return { name: profileName, ...profile };
}

function hasDuplicate(values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

export function validateRuntimeTopologyManifest(manifest) {
  // Phase 186: accept either the manifest (v1 single-profile) or a
  // profile object (v2 selected profile). v1 callers pass the manifest;
  // v2 callers pass `resolveProfile(manifest, name)`.
  const isProfile = typeof manifest?.services === "undefined" && Array.isArray(manifest?.profile);
  const services = Array.isArray(manifest?.services) ? manifest.services : manifest?.profile?.services ?? [];
  const errors = [];
  const warnings = [];
  const serviceIds = new Set(services.map((service) => service.id));
  const duplicateService = hasDuplicate(services.map((service) => service.id));

  // Version check skipped when validating a profile (the parent manifest
  // already validated the version, or the caller passed a profile
  // object directly without a `version` field). When validating a v1
  // manifest directly, the version must be 1.
  const isProfileInput = manifest?._isProfile || (Array.isArray(manifest?.services) && typeof manifest?.version === "undefined");
  if (!isProfileInput && manifest?.version !== 1 && manifest?.version !== 2) {
    errors.push(`Unsupported runtime topology version: ${manifest?.version}`);
  }
  if (duplicateService) errors.push(`Duplicate runtime service id: ${duplicateService}`);

  for (const service of services) {
    if (!service.id || typeof service.id !== "string") errors.push("Runtime service id is required");
    if (!service.displayName || typeof service.displayName !== "string") {
      errors.push(`Runtime service ${service.id ?? "<unknown>"} displayName is required`);
    }
    if (!Array.isArray(service.ports) || service.ports.length === 0) {
      // healthcheck is a service with no ports (it's a systemd timer
      // that runs /usr/local/bin/memroos-healthcheck.py). Allow ports=[].
      if (service.id !== "healthcheck") {
        errors.push(`Runtime service ${service.id ?? "<unknown>"} must declare at least one port`);
        continue;
      }
    }
    if (!Array.isArray(service.supervisionModes) || service.supervisionModes.length === 0) {
      errors.push(`Runtime service ${service.id ?? "<unknown>"} must declare supervision modes`);
    }
    if (service.supervisionModes?.includes("docker-compose") && !service.dockerComposeService) {
      errors.push(`Runtime service ${service.id ?? "<unknown>"} must declare dockerComposeService`);
    }
    for (const dependencyId of service.dependsOn ?? []) {
      if (!serviceIds.has(dependencyId)) {
        errors.push(`Runtime service ${service.id} depends on unknown service: ${dependencyId}`);
      }
    }

    const duplicatePort = hasDuplicate(service.ports.map((port) => port.id));
    if (duplicatePort) errors.push(`Runtime service ${service.id} duplicate port id: ${duplicatePort}`);

    for (const port of service.ports) {
      if (!Number.isInteger(port.defaultPort) || port.defaultPort < 1 || port.defaultPort > 65535) {
        errors.push(`Runtime service ${service.id} port ${port.id} has invalid defaultPort`);
      }
      if (
        port.containerPort !== undefined &&
        (!Number.isInteger(port.containerPort) || port.containerPort < 1 || port.containerPort > 65535)
      ) {
        errors.push(`Runtime service ${service.id} port ${port.id} has invalid containerPort`);
      }
    }

    if (service.required && !service.health) {
      warnings.push(`Required runtime service ${service.id} has no health check`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function getRuntimeTopologyPort(manifestOrProfile, serviceId, portId) {
  // Resolve the services array from either a v1 manifest (flat
  // `services`) or a v2 profile (`{ services: [...] }`).
  const services = Array.isArray(manifestOrProfile?.services)
    ? manifestOrProfile.services
    : manifestOrProfile?.profile?.services ?? [];
  const service = services.find((item) => item.id === serviceId);
  if (!service) throw new Error(`Unknown runtime service: ${serviceId}`);

  const port = (service.ports ?? []).find((item) => item.id === portId);
  if (!port) throw new Error(`Unknown runtime port: ${serviceId}/${portId}`);
  if (!Number.isInteger(port.defaultPort)) {
    throw new Error(`Runtime port ${serviceId}/${portId} has no integer defaultPort`);
  }

  return port.defaultPort;
}

function portRequiredIn(port, mode) {
  return Array.isArray(port.requiredIn) && port.requiredIn.includes(mode);
}

function expectText(text, needle, errors, checked, label) {
  if (text.includes(needle)) {
    checked.push(label);
  } else {
    errors.push(`Missing ${label}: ${needle}`);
  }
}

function expectedDockerHealthNeedle(port, path) {
  if (!Number.isInteger(port?.containerPort)) return null;
  if (!path || typeof path !== "string") return null;
  return `http://127.0.0.1:${port.containerPort}${path}`;
}

export function validateRuntimeTopologyArtifacts(manifest, artifacts, profileName) {
  // Phase 186: when the manifest is v2, validate against the
  // selected profile (defaultProfile or the first profile) rather
  // than the top-level services array. The artifact-level checks
  // (docker-compose, start.sh, launchd) only apply to the local-dev
  // profile. For the production profile, the artifacts to validate
  // are systemd unit files + Cloudflare Tunnel config under
  // deploy/oracle-1/.
  const isV2 = manifest?.version === 2 && manifest?.profiles;
  const profile = isV2 ? resolveProfile(manifest, profileName) : null;
  const services = isV2 ? profile.services : manifest.services ?? [];
  const isProduction = isV2 && profile.name === "production";

  // Tell the per-service validator to skip the version check (the
  // parent manifest already validated the version).
  const base = validateRuntimeTopologyManifest({ services, _isProfile: true });
  const errors = [...base.errors];
  const warnings = [...base.warnings];
  const checked = [];

  const dockerServiceNames = new Map(
    services
      .filter((service) => service.dockerComposeService)
      .map((service) => [service.id, service.dockerComposeService])
  );

  for (const service of services) {
    // Production profile: validate against systemd unit files + Cloudflare
    // Tunnel config under deploy/oracle-1/. The local-dev artifact checks
    // (docker-compose, start.sh, launchd) are skipped.
    if (isProduction) {
      if (artifacts.systemdUnitText && service.deployUnit) {
        const unitName = path.basename(service.deployUnit);
        // The readRuntimeArtifacts helper wraps each *.service in a
        // sentinel header ("# === <unit-name> ===") so the validator
        // can match by unit file name. The header is the canonical
        // anchor; relying on substring-searching the bare unit
        // filename is fragile because the filename may appear in
        // other contexts (paths, comments, descriptions).
        const headerSentinel = `# === ${unitName} ===`;
        if (!artifacts.systemdUnitText.includes(headerSentinel)) {
          errors.push(`Missing systemd unit file: ${service.deployUnit}`);
        } else {
          checked.push(`systemd:${service.id}:${unitName}`);
        }
        // If the service has a docker-compose service, the unit
        // file should ExecStart docker compose up the service.
        // Match the substring `up <service>` rather than the
        // literal `docker compose up <service>` because the real
        // ExecStart typically uses `docker compose -f <file> up <svc>`.
        if (service.dockerComposeService) {
          const execNeedle = `up ${service.dockerComposeService}`;
          if (!artifacts.systemdUnitText.includes(execNeedle)) {
            errors.push(`Systemd unit ${unitName} does not bring up ${service.dockerComposeService}`);
          } else {
            checked.push(`systemd-exec:${service.id}:${execNeedle}`);
          }
        }
      } else if (artifacts.systemdUnitText && service.supervisionModes?.includes("systemd") && !service.deployUnit) {
        errors.push(`Runtime service ${service.id} supervises via systemd but has no deployUnit`);
      }
      if (artifacts.cloudflareTunnelText && service.id === "memroos-app") {
        if (!artifacts.cloudflareTunnelText.includes(service.id)) {
          errors.push(`Cloudflare Tunnel config does not include ${service.id}`);
        } else {
          checked.push(`cloudflare-tunnel:memroos-app`);
        }
      }
      continue; // skip the local-dev artifact checks below
    }
    if (artifacts.dockerComposeText && service.supervisionModes?.includes("docker-compose")) {
      expectText(
        artifacts.dockerComposeText,
        `\n  ${service.dockerComposeService}:`,
        errors,
        checked,
        `docker-service:${service.id}:${service.dockerComposeService}`
      );

      for (const dependencyId of service.dependsOn ?? []) {
        const dependencyName = dockerServiceNames.get(dependencyId);
        if (!dependencyName) {
          errors.push(`Runtime service ${service.id} depends on ${dependencyId} without dockerComposeService`);
          continue;
        }
        expectText(
          artifacts.dockerComposeText,
          `\n      ${dependencyName}:`,
          errors,
          checked,
          `docker-depends-on:${service.id}:${dependencyId}:${dependencyName}`
        );
      }
    }

    for (const port of service.ports ?? []) {
      if (artifacts.dockerComposeText && portRequiredIn(port, "docker-compose")) {
        if (port.env && port.containerPort) {
          expectText(
            artifacts.dockerComposeText,
            `\${${port.env}:-${port.defaultPort}}:${port.containerPort}`,
            errors,
            checked,
            `docker:${service.id}:${port.env}:${port.defaultPort}->${port.containerPort}`
          );
        } else {
          expectText(
            artifacts.dockerComposeText,
            String(port.defaultPort),
            errors,
            checked,
            `docker:${service.id}:${port.defaultPort}`
          );
        }

        const healthNeedle = expectedDockerHealthNeedle(port, service.health?.path);
        if (healthNeedle) {
          expectText(
            artifacts.dockerComposeText,
            healthNeedle,
            errors,
            checked,
            `docker-health:${service.id}:${healthNeedle}`
          );
        }
      }

      if (artifacts.startScriptText && port.env && portRequiredIn(port, "manual-script")) {
        expectText(
          artifacts.startScriptText,
          `"$TOPOLOGY_CHECK" port ${service.id} ${port.id}`,
          errors,
          checked,
          `script:${service.id}:${port.env}=${port.defaultPort}`
        );
      }

      if (artifacts.launchdStartText && port.env && portRequiredIn(port, "launchd")) {
        expectText(
          artifacts.launchdStartText,
          `runtime_topology_port ${service.id} ${port.id}`,
          errors,
          checked,
          `launchd:${service.id}:${port.env}=${port.defaultPort}`
        );
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, checked };
}

function readRuntimeArtifacts(root = repoRoot, profileName) {
  // The artifact set depends on the profile. local-dev reads
  // docker-compose + start.sh + launchd. production reads the
  // deploy/ tree (systemd unit files + Cloudflare Tunnel config).
  const manifest = loadRuntimeTopologyManifest(path.join(root, "apps/memroos/src/lib/runtime-topology.json"));
  const isV2 = manifest?.version === 2 && manifest?.profiles;
  const effectiveProfile = profileName ?? manifest?.defaultProfile ?? "local-dev";
  if (isV2 && effectiveProfile === "production") {
    const deployRoot = path.join(root, "deploy/oracle-1");
    const systemdDir = path.join(deployRoot, "systemd");
    // Concatenate every *.service file under deploy/oracle-1/systemd/.
    // The validator checks for `docker compose up <service>` in the
    // concatenated text below. Files are joined with a newline so
    // the `\n<unit>\n` substring needle always matches a unit header
    // (we look for `Description=` + `ExecStart=` as the real anchors).
    let systemdUnitText = "";
    let serviceFileCount = 0;
    try {
      const entries = fs.readdirSync(systemdDir);
      for (const entry of entries.sort()) {
        if (!entry.endsWith(".service")) continue;
        const text = fs.readFileSync(path.join(systemdDir, entry), "utf8");
        systemdUnitText += `\n# === ${entry} ===\n${text}\n`;
        serviceFileCount += 1;
      }
    } catch (err) {
      // Phase 186 / TOPOPROD-02: production profile REQUIRES the
      // deploy/ tree to be present. Fail closed — the previous
      // implementation swallowed this and silently passed.
      throw new Error(
        `production profile requires ${systemdDir} to exist with at least one *.service file (${err.message})`
      );
    }
    // The directory exists but has zero *.service files. This is the
    // validator's "Empty deploy/ tree" failure mode — fail closed
    // because a production profile with no service files is a hole.
    if (serviceFileCount === 0) {
      throw new Error(
        `production profile requires at least one *.service file under ${systemdDir} (found 0)`
      );
    }
    let cloudflareTunnelText = "";
    try {
      cloudflareTunnelText = fs.readFileSync(
        path.join(deployRoot, "cloudflare-tunnel.yml"),
        "utf8",
      );
    } catch {
      // cloudflare-tunnel.yml is optional for now (the architecture
      // review lists it as a target but oracle-1 may run without
      // a tunnel when accessed only via Tailscale). Surface as
      // missing in the artifact object so the caller can warn
      // without failing the gate.
      cloudflareTunnelText = "";
    }
    return {
      systemdUnitText,
      cloudflareTunnelText,
      // Sentinel: tells the validator that production artifacts
      // are required for production profiles.
      production: true,
    };
  }
  return {
    dockerComposeText: fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8"),
    startScriptText: fs.readFileSync(path.join(root, "start.sh"), "utf8"),
    launchdStartText: fs.readFileSync(path.join(root, "scripts/launchd-start.sh"), "utf8"),
    production: false,
  };
}

export function checkRuntimeTopology(root = repoRoot, profileName) {
  const manifest = loadRuntimeTopologyManifest(path.join(root, "apps/memroos/src/lib/runtime-topology.json"));
  return validateRuntimeTopologyArtifacts(manifest, readRuntimeArtifacts(root, profileName), profileName);
}

function printResult(result) {
  if (result.ok) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          checked: result.checked,
          warnings: result.warnings,
        },
        null,
        2
      )
    );
    return;
  }

  console.error(
    JSON.stringify(
      {
        ok: false,
        errors: result.errors,
        warnings: result.warnings,
        checked: result.checked,
      },
      null,
      2
    )
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Parse args: [port <service> <port> [profile]] | [check [profile]]
  const args = process.argv.slice(2);
  let profileName;
  let command = "check";

  if (args[0] === "port") {
    command = "port";
    const [, , serviceId, portId, profileArg] = args;
    profileName = profileArg;
    const manifest = loadRuntimeTopologyManifest();
    const services = manifest.profiles ? resolveProfile(manifest, profileName).services : manifest.services;
    try {
      const port = services.find((s) => s.id === serviceId)?.ports?.find((p) => p.id === portId);
      if (!port || !Number.isInteger(port.defaultPort)) {
        throw new Error(`port ${serviceId}/${portId} not found or has no integer defaultPort`);
      }
      console.log(String(port.defaultPort));
      process.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  } else {
    profileName = args[0]; // optional positional
  }

  const result = checkRuntimeTopology(repoRoot, profileName);
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}

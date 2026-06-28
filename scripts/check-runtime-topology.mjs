#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(repoRoot, "apps/memroos/src/lib/runtime-topology.json");

export function loadRuntimeTopologyManifest(filePath = manifestPath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
  const errors = [];
  const warnings = [];
  const services = Array.isArray(manifest?.services) ? manifest.services : [];
  const serviceIds = new Set(services.map((service) => service.id));
  const duplicateService = hasDuplicate(services.map((service) => service.id));

  if (manifest?.version !== 1) errors.push(`Unsupported runtime topology version: ${manifest?.version}`);
  if (!Array.isArray(manifest?.services)) errors.push("Runtime topology services must be an array");
  if (duplicateService) errors.push(`Duplicate runtime service id: ${duplicateService}`);

  for (const service of services) {
    if (!service.id || typeof service.id !== "string") errors.push("Runtime service id is required");
    if (!service.displayName || typeof service.displayName !== "string") {
      errors.push(`Runtime service ${service.id ?? "<unknown>"} displayName is required`);
    }
    if (!Array.isArray(service.ports) || service.ports.length === 0) {
      errors.push(`Runtime service ${service.id ?? "<unknown>"} must declare at least one port`);
      continue;
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

export function getRuntimeTopologyPort(manifest, serviceId, portId) {
  const service = (manifest.services ?? []).find((item) => item.id === serviceId);
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

export function validateRuntimeTopologyArtifacts(manifest, artifacts) {
  const base = validateRuntimeTopologyManifest(manifest);
  const errors = [...base.errors];
  const warnings = [...base.warnings];
  const checked = [];

  const dockerServiceNames = new Map(
    (manifest.services ?? [])
      .filter((service) => service.dockerComposeService)
      .map((service) => [service.id, service.dockerComposeService])
  );

  for (const service of manifest.services ?? []) {
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

function readRuntimeArtifacts(root = repoRoot) {
  return {
    dockerComposeText: fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8"),
    startScriptText: fs.readFileSync(path.join(root, "start.sh"), "utf8"),
    launchdStartText: fs.readFileSync(path.join(root, "scripts/launchd-start.sh"), "utf8"),
  };
}

export function checkRuntimeTopology(root = repoRoot) {
  const manifest = loadRuntimeTopologyManifest(path.join(root, "apps/memroos/src/lib/runtime-topology.json"));
  return validateRuntimeTopologyArtifacts(manifest, readRuntimeArtifacts(root));
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
  const [, , command, serviceId, portId] = process.argv;

  if (command === "port") {
    try {
      console.log(String(getRuntimeTopologyPort(loadRuntimeTopologyManifest(), serviceId, portId)));
      process.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  const result = checkRuntimeTopology(repoRoot);
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}

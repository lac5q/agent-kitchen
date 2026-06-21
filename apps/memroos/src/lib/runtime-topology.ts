import manifestData from "./runtime-topology.json";

export type RuntimeSupervisionMode = "docker-compose" | "launchd" | "manual-script" | "external";

export interface RuntimePortDeclaration {
  id: string;
  env?: string;
  defaultPort: number;
  containerPort?: number;
  requiredIn?: RuntimeSupervisionMode[];
}

export interface RuntimeHealthCheck {
  type: "http";
  path: string;
  timeoutMs: number;
}

export interface RuntimeService {
  id: string;
  displayName: string;
  required: boolean;
  ports: RuntimePortDeclaration[];
  health?: RuntimeHealthCheck;
  supervisionModes: RuntimeSupervisionMode[];
  dependsOn?: string[];
  env?: string[];
}

export interface RuntimeTopologyManifest {
  version: 1;
  profile: "local-dev" | "single-host" | "docker-demo";
  services: RuntimeService[];
}

export interface RuntimeTopologyValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface RuntimeTopologyArtifactValidation extends RuntimeTopologyValidation {
  checked: string[];
}

export function defaultRuntimeTopologyManifest(
  profile: RuntimeTopologyManifest["profile"] = "local-dev"
): RuntimeTopologyManifest {
  const manifest = JSON.parse(JSON.stringify(manifestData)) as RuntimeTopologyManifest;
  return { ...manifest, profile };
}

function hasDuplicate(values: string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

export function validateRuntimeTopologyManifest(
  manifest: RuntimeTopologyManifest
): RuntimeTopologyValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const serviceIds = manifest.services.map((service) => service.id);
  const duplicateService = hasDuplicate(serviceIds);

  if (manifest.version !== 1) errors.push(`Unsupported runtime topology version: ${manifest.version}`);
  if (duplicateService) errors.push(`Duplicate runtime service id: ${duplicateService}`);

  for (const service of manifest.services) {
    if (!service.id.trim()) errors.push("Runtime service id is required");
    if (!service.displayName.trim()) errors.push(`Runtime service ${service.id} displayName is required`);
    if (service.ports.length === 0) errors.push(`Runtime service ${service.id} must declare at least one port`);
    if (service.supervisionModes.length === 0) {
      errors.push(`Runtime service ${service.id} must declare supervision modes`);
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

function portRequiredIn(port: RuntimePortDeclaration, mode: RuntimeSupervisionMode): boolean {
  return port.requiredIn?.includes(mode) ?? false;
}

function expectText(
  text: string,
  needle: string,
  errors: string[],
  checked: string[],
  label: string
) {
  if (text.includes(needle)) {
    checked.push(label);
  } else {
    errors.push(`Missing ${label}: ${needle}`);
  }
}

export function validateRuntimeTopologyArtifacts(
  manifest: RuntimeTopologyManifest,
  artifacts: {
    dockerComposeText?: string;
    startScriptText?: string;
    launchdStartText?: string;
  }
): RuntimeTopologyArtifactValidation {
  const base = validateRuntimeTopologyManifest(manifest);
  const errors = [...base.errors];
  const warnings = [...base.warnings];
  const checked: string[] = [];

  for (const service of manifest.services) {
    for (const port of service.ports) {
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
      }

      if (artifacts.startScriptText && port.env && portRequiredIn(port, "manual-script")) {
        expectText(
          artifacts.startScriptText,
          `port ${service.id} ${port.id}`,
          errors,
          checked,
          `script:${service.id}:${port.env}=${port.defaultPort}`
        );
      }

    if (artifacts.launchdStartText && port.env && portRequiredIn(port, "launchd")) {
      expectText(
        artifacts.launchdStartText,
        `port ${service.id} ${port.id}`,
        errors,
        checked,
        `launchd:${service.id}:${port.env}=${port.defaultPort}`
        );
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, checked };
}

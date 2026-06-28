#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(repoRoot, "contracts/memroos-contracts.json");

export function loadContractManifest(filePath = manifestPath) {
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

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateContractManifest(manifest) {
  const errors = [];
  const warnings = [];
  const contracts = Array.isArray(manifest?.contracts) ? manifest.contracts : [];
  const duplicateContract = hasDuplicate(contracts.map((contract) => contract.id));

  if (manifest?.manifestId !== "memroos-contract-manifest.v1") {
    errors.push(`Unsupported contract manifest id: ${manifest?.manifestId}`);
  }
  if (manifest?.version !== 1) errors.push(`Unsupported contract manifest version: ${manifest?.version}`);
  if (!Array.isArray(manifest?.contracts)) errors.push("Contract manifest contracts must be an array");
  if (duplicateContract) errors.push(`Duplicate contract id: ${duplicateContract}`);

  for (const contract of contracts) {
    if (!isNonEmptyString(contract.id)) errors.push("Contract id is required");
    if (!isNonEmptyString(contract.domain)) errors.push(`Contract ${contract.id ?? "<unknown>"} domain is required`);
    if (!isNonEmptyString(contract.schemaSource)) {
      errors.push(`Contract ${contract.id ?? "<unknown>"} schemaSource is required`);
    }
    if (contract.header !== undefined && contract.header !== "X-Memroos-Contract") {
      errors.push(`Contract ${contract.id} has unsupported header: ${contract.header}`);
    }
    if (!Array.isArray(contract.discovery) || contract.discovery.length === 0) {
      errors.push(`Contract ${contract.id} must declare at least one discovery surface`);
    }
    if (!Array.isArray(contract.artifacts) || contract.artifacts.length === 0) {
      errors.push(`Contract ${contract.id} must declare at least one checked artifact`);
    }

    const duplicateArtifact = hasDuplicate((contract.artifacts ?? []).map((artifact) => artifact.label));
    if (duplicateArtifact) errors.push(`Contract ${contract.id} duplicate artifact label: ${duplicateArtifact}`);

    for (const artifact of contract.artifacts ?? []) {
      if (!isNonEmptyString(artifact.label)) errors.push(`Contract ${contract.id} artifact label is required`);
      if (!isNonEmptyString(artifact.path)) errors.push(`Contract ${contract.id} artifact path is required`);
      if (!isNonEmptyString(artifact.contractIdConstant)) {
        errors.push(`Contract ${contract.id} artifact ${artifact.label ?? "<unknown>"} needs contractIdConstant`);
      }
    }

    for (const discovery of contract.discovery ?? []) {
      if (!isNonEmptyString(discovery.kind)) errors.push(`Contract ${contract.id} discovery kind is required`);
      if (discovery.routeFile && !isNonEmptyString(discovery.path)) {
        errors.push(`Contract ${contract.id} route discovery needs path`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function readArtifactText(relativePath, artifacts) {
  if (Object.prototype.hasOwnProperty.call(artifacts, relativePath)) {
    return artifacts[relativePath];
  }
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function expectNeedle(text, needle, errors, label) {
  if (!text.includes(needle)) {
    errors.push(`Missing ${label}: ${needle}`);
  }
}

function fieldNeedlesForArtifact(artifactPath, field) {
  if (artifactPath.endsWith(".py")) {
    return [`value.get("${field}")`, `layers.values()`];
  }
  if (artifactPath.includes("packages/sdk-ts")) {
    return [`record.${field}`, `record.${field} !== undefined`, `layers`];
  }
  return [`${field}`];
}

function expectField(text, field, errors, label) {
  const needles = fieldNeedlesForArtifact(label, field);
  if (!needles.some((needle) => text.includes(needle))) {
    errors.push(`Missing ${label}:${field}`);
  }
}

function validatePublicEvalSchemaNeedles(contract, artifact, text, errors, checked) {
  const evalSubmit = contract.schemas?.EvalSubmitResult?.required ?? [];
  const layerBreakdown = contract.schemas?.EvalLayerBreakdown?.required ?? [];

  if (evalSubmit.length === 0 && layerBreakdown.length === 0) return;

  for (const field of evalSubmit) {
    expectField(text, field, errors, artifact.path);
  }
  for (const field of layerBreakdown) {
    expectField(text, field, errors, artifact.path);
  }
  checked.push(`${artifact.label}:schema`);
}

function validateA2aSchemaNeedles(contract, artifact, text, errors, checked) {
  const taskStates = contract.schemas?.A2aTask?.taskStates ?? [];
  if (taskStates.length === 0) return;

  const stateSourceText =
    text.includes("A2A_TASK_STATES") && artifact.path !== "apps/memroos/src/lib/a2a/types.ts"
      ? fs.readFileSync(path.join(repoRoot, "apps/memroos/src/lib/a2a/types.ts"), "utf8")
      : text;

  for (const state of taskStates) {
    expectNeedle(stateSourceText, `"${state}"`, errors, `${artifact.path}:A2A_TASK_STATES`);
  }
  checked.push(`${artifact.label}:schema`);
}

export function validateContractArtifacts(manifest, options = {}) {
  const base = validateContractManifest(manifest);
  const errors = [...base.errors];
  const warnings = [...base.warnings];
  const checked = [];
  const artifacts = options.artifacts ?? {};

  for (const contract of manifest.contracts ?? []) {
    if (contract.schemaSource) {
      const schemaSourcePath = path.join(repoRoot, contract.schemaSource);
      if (!fs.existsSync(schemaSourcePath)) {
        errors.push(`Missing schema source for ${contract.id}: ${contract.schemaSource}`);
      }
    }

    for (const discovery of contract.discovery ?? []) {
      if (discovery.routeFile) {
        const routeFilePath = path.join(repoRoot, discovery.routeFile);
        if (!fs.existsSync(routeFilePath)) {
          errors.push(`Missing discovery route for ${contract.id}: ${discovery.routeFile}`);
        }
      }
    }

    for (const artifact of contract.artifacts ?? []) {
      let text = "";
      try {
        text = readArtifactText(artifact.path, artifacts);
      } catch {
        errors.push(`Missing checked artifact for ${contract.id}: ${artifact.path}`);
        continue;
      }

      expectNeedle(
        text,
        `${artifact.contractIdConstant} = "${contract.id}"`,
        errors,
        `${artifact.path}:${artifact.contractIdConstant}`
      );

      if (artifact.headerConstant) {
        expectNeedle(
          text,
          `${artifact.headerConstant} = "${contract.header}"`,
          errors,
          `${artifact.path}:${artifact.headerConstant}`
        );
      }

      if (contract.id === "public-eval-api.v1") {
        validatePublicEvalSchemaNeedles(contract, artifact, text, errors, checked);
      }
      if (contract.id === "memroos-a2a.v1") {
        validateA2aSchemaNeedles(contract, artifact, text, errors, checked);
      }

      checked.push(artifact.label ?? `${artifact.path}:${contract.id}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, checked };
}

function main() {
  const manifest = loadContractManifest();
  const result = validateContractArtifacts(manifest);
  if (!result.ok) {
    for (const error of result.errors) console.error(error);
    process.exit(1);
  }
  for (const warning of result.warnings) console.warn(warning);
  console.log(`Contract manifest OK: ${result.checked.length} artifact checks`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

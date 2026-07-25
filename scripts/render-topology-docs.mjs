#!/usr/bin/env node
// TOPOPROD-03: render a markdown table of services/ports/health
// from apps/memroos/src/lib/runtime-topology.json. The output is the
// canonical source of truth for the topology tables in
// docs/production-deployment.md and docs/cloud-operator-oracle1-runbook.md.
// Re-render with `node scripts/render-topology-docs.mjs` and paste the
// rendered block into the docs. Phase 187's check:route-auth-boundary
// gate enforces the same content the docs reference.
//
// Usage:
//   node scripts/render-topology-docs.mjs                # default profile
//   node scripts/render-topology-docs.mjs production    # production profile
//   node scripts/render-topology-docs.mjs --json        # machine-readable
//   node scripts/render-topology-docs.mjs --out docs/.topology-prod.md
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(repoRoot, "apps/memroos/src/lib/runtime-topology.json");

const args = process.argv.slice(2);
const json = args.includes("--json");
const outFlagIndex = args.indexOf("--out");
const outArg = outFlagIndex >= 0 ? args[outFlagIndex + 1] : undefined;
const profileName = args.find((arg) => !arg.startsWith("--") && arg !== outArg && args.indexOf(arg) !== outFlagIndex + 1);

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// v1 manifests are flat; v2 manifests have profiles. Resolve to a
// list of services regardless of shape.
let services;
let title;
if (manifest.version === 2 && manifest.profiles) {
  const profile = profileName ?? manifest.defaultProfile ?? "local-dev";
  const data = manifest.profiles[profile];
  if (!data) {
    console.error(`unknown profile: ${profile}; available: ${Object.keys(manifest.profiles).join(", ")}`);
    process.exit(2);
  }
  services = data.services;
  title = `Runtime topology — ${profile} profile`;
} else {
  services = manifest.services;
  title = `Runtime topology — local-dev (v1 manifest)`;
}

if (json) {
  console.log(JSON.stringify({ profile: profileName ?? "v1", services }, null, 2));
  process.exit(0);
}

const lines = [];
lines.push(`# ${title}`);
lines.push("");
lines.push(`Source: \`apps/memroos/src/lib/runtime-topology.json\` (rendered by \`scripts/render-topology-docs.mjs\`).`);
lines.push("");
lines.push("| Service | Required | Display | Health | Port (default) | Supervision |");
lines.push("|---------|----------|---------|--------|----------------|-------------|");
for (const service of services) {
  const health = service.health ? `${service.health.type} ${service.health.path ?? ""}` : "—";
  const ports = (service.ports ?? []).map((p) => `${p.id}=${p.defaultPort}`).join(", ") || "—";
  const supervision = (service.supervisionModes ?? []).join(", ") || "—";
  lines.push(
    `| \`${service.id}\` | ${service.required ? "✓" : ""} | ${service.displayName} | ${health} | ${ports} | ${supervision} |`
  );
}
lines.push("");
lines.push("Required services MUST be healthy for the operator to admit traffic. Health paths above are the canonical probe; the runtime-topology gate asserts each \`required: true\` service's health endpoint is configured.");
lines.push("");

const out = lines.join("\n");
if (outArg) {
  fs.writeFileSync(path.join(repoRoot, outArg), out);
  console.error(`wrote ${outArg}`);
} else {
  console.log(out);
}

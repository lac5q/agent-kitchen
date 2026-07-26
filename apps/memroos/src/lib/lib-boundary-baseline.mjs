// LIBNORM-03 (Phase 189) — `src/lib/` root boundary.
//
// Placement rule (docs/architecture.md): domain logic lives in
// `lib/<domain>/`. The `lib/` root is reserved for cross-cutting primitives
// that genuinely have no domain.
//
// These 75 files predate the rule. The list is a BASELINE captured
// 2026-07-26 and may only shrink. `scripts/check-lib-boundary.mjs` fails CI
// when a NEW root-level file appears that is neither a reserved primitive nor
// on this list. When you move a file into `lib/<domain>/`, delete its line.
//
// Do not add to this list. A new root-level file is the thing the gate exists
// to prevent — put it in `lib/<domain>/` instead.

/** Cross-cutting primitives that legitimately live at the `lib/` root. */
export const LIB_ROOT_RESERVED = [
  "env.ts",
  "db.ts",
  "paths.ts",
  "constants.ts",
  "api-error.ts",
];

/** Pre-existing root-level files awaiting relocation. Shrink only. */
export const LIB_ROOT_EXCEPTIONS = [
  "agent-checkpoints.ts",
  "agent-cicd-gates.ts",
  "agent-context-bus.ts",
  "agent-context-packet.ts",
  "agent-context-policy.ts",
  "agent-gsd-control.ts",
  "agent-liveness.ts",
  "agent-memory-continuity.ts",
  "agent-onboarding.ts",
  "agent-registry-seed.ts",
  "agent-registry.ts",
  "api-client.ts",
  "artifact-gate.ts",
  "audit.ts",
  "blog.ts",
  "chatgpt-actions.ts",
  "content-scanner.ts",
  "context-sources.ts",
  "cron-health.ts",
  "db-ingest.ts",
  "db-schema.ts",
  "directive-budget.ts",
  "efficiency-telemetry.ts",
  "erasure-tombstone.ts",
  "failures-parser.ts",
  "internal-api-key.ts",
  "iris-scanner.ts",
  "knowledge-collections.ts",
  "local-agent-runtime.ts",
  "meeting-qmd-recall.ts",
  "meeting-source-status.ts",
  "memory-consolidation.ts",
  "memory-decay.ts",
  "memory-doctor.ts",
  "memory-graph-catchup-scheduler.ts",
  "memory-inventory.ts",
  "memory-policy-lab.ts",
  "memory-recall-evals.ts",
  "memory-retention-expiry-scheduler.ts",
  "memory-trace-observability.ts",
  "metadata.ts",
  "metric-status.ts",
  "model-routing.ts",
  "noc-filters.ts",
  "noc-theme.ts",
  "node-keyword-map.ts",
  "observe-capture-depth.ts",
  "observe-health.ts",
  "observe-sidecar.ts",
  "okf.ts",
  "operator-auth.ts",
  "parsers.ts",
  "recollection-policy.ts",
  "response-cache.ts",
  "runtime-topology.ts",
  "scheduler-singleton.ts",
  "schema.tsx",
  "security-policy.ts",
  "shared-space.ts",
  "skill-budget.ts",
  "skill-workflow.ts",
  "space-cache.ts",
  "space.ts",
  "storage-health.ts",
  "tool-attention.ts",
  "ui-constants.ts",
  "understand-graph.ts",
  "understand-policy.ts",
  "utils.ts",
  "wiki-digest-scheduler.ts",
  "wiki-digest.ts",
  "wiki-graph.ts",
  "wiki-vault.ts",
  "workspace.ts",
  "write-rules.ts"
];

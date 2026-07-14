/**
 * Public surface for retrieval-bench improvement modules.
 *
 * Implements BENCH-03 (continued) + RETRIEVAL-01 (continued):
 *
 *   VAL-RETR-014 — `parseCliArgs` + `createWriteGuard`
 *   VAL-RETR-015 — `extractEntities` + `decideEntityMerge`
 *   VAL-RETR-016 — `performTierFanout`
 *   VAL-RETR-017 — `rerankCandidates`
 *   VAL-RETR-018 — `dedupeRetrievalResults` + `decideMerge`
 *   VAL-RETR-019 — `packContext`
 *   VAL-RETR-020 — `performTemporalRetrieval`
 *   VAL-RETR-021 — `describeProviderFlags`
 *   VAL-RETR-022 — `checkProviderAvailable`
 *   VAL-RETR-023 — `applyProviderGovernanceGate`
 *   VAL-RETR-024 — `reconcileStages` + `stageRecord`
 *   VAL-RETR-025 — `applyRedactionGuard` (lives in redaction.ts; re-exported)
 *   VAL-RETR-026 — covered by existing audit chain + retrieval-bench tests
 *   VAL-RETR-027 — `buildReplayHandle` + `deriveRunFingerprint`
 *   VAL-RETR-028 — `evaluatePublicationGate`
 *   VAL-RETR-029 — `buildReplayHandle`
 *   VAL-RETR-030 — `checkContamination` + `createIsolationContext`
 */

export * from "./entity-extraction";
export * from "./temporal-retrieval";
export * from "./dedupe";
export * from "./context-pack";
export * from "./rerank";
export * from "./tier-fanout";
export * from "./report-publication";
export * from "./contamination-guard";
export * from "./provider-credentials";
export * from "./reconciliation";
export * from "./cli-parser";
export * from "./audit-chain";

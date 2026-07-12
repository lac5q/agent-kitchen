/**
 * Public surface of the comparative retrieval benchmark module.
 *
 * Implements BENCH-01..03 + RETRIEVAL-01 (core):
 *   - VAL-RETR-001 synthetic fixture smoke run
 *   - VAL-RETR-002 normalized fixture validation
 *   - VAL-RETR-003 dataset adapter provenance (LoCoMo/LongMemEval/synthetic)
 *   - VAL-RETR-004 licensed data non-distribution
 *   - VAL-RETR-005 shared result contract
 *   - VAL-RETR-006 lexical/no-memory control validity
 *   - VAL-RETR-007 live retrieval authorization gating
 *   - VAL-RETR-008 benchmark lane separation
 *   - VAL-RETR-009 provider/adapter failure handling
 *   - VAL-RETR-010 ranked-ID metrics
 *   - VAL-RETR-011 conservative answer/abstention scoring
 *   - VAL-RETR-012 honest latency/token/context metrics
 *   - VAL-RETR-013 reproducible aggregate reports
 */

export * from "./schema";
export * from "./validation";
export * from "./redaction";
export * from "./metrics";
export * from "./lanes";
export * from "./failure";
export * from "./runner";

export {
  lexicalAdapter,
  lexicalAdapterEntry,
  LEXICAL_ADAPTER_ID,
  LEXICAL_ADAPTER_VERSION,
  lexicalRank,
} from "./adapters/lexical";

export {
  noMemoryAdapter,
  noMemoryAdapterEntry,
  NO_MEMORY_ADAPTER_ID,
  NO_MEMORY_ADAPTER_VERSION,
} from "./adapters/no-memory";

export {
  liveAdapter,
  liveAdapterEntry,
  LIVE_ADAPTER_ID,
  LIVE_ADAPTER_VERSION,
  evaluateLivePolicy,
  type LivePolicyDecision,
} from "./adapters/live";

export {
  vectorLocalAdapterEntry,
  mem0AdapterEntry,
  qdrantAdapterEntry,
  VECTOR_LOCAL_ADAPTER_ID,
  MEM0_ADAPTER_ID,
  QDRANT_ADAPTER_ID,
} from "./adapters/vector";

export {
  loadSyntheticSmoke,
  hashSyntheticSmoke,
  type SyntheticAdapterInit,
  type SyntheticAdapterResult,
} from "./adapters/synthetic";

export {
  convertLoCoMoSamples,
  hashLoCoMoSource,
  type LoCoMoRawSample,
  type LoCoMoAdapterInit,
} from "./adapters/locomo";

export {
  convertLongMemEvalSamples,
  hashLongMemEvalSource,
  type LongMemEvalRawSample,
} from "./adapters/longmemeval";

export {
  registerAdapter,
  getAdapter,
  listAdapters,
  resetAdapterRegistry,
  buildUnavailableResult,
  type BenchmarkAdapter,
  type BenchmarkAdapterInit,
  type AdapterRegistryEntry,
} from "./adapters";

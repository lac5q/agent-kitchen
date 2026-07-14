export const PACK_PROVENANCE_CLASSIFICATIONS = ["public", "internal", "restricted"] as const;

export interface PackProvenanceSummary {
  sourceId: string;
  classification: (typeof PACK_PROVENANCE_CLASSIFICATIONS)[number];
  importedAt: string;
  references: string[];
}

export interface PackTypeExtension {
  kind: "core" | "dependency";
  id: string;
  ontologyId?: string;
  ontologyVersion?: string;
  ontologyContentHash?: string;
  namespace?: string;
  version?: string;
  sourceHash?: string;
}

export class PackContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackContractError";
  }
}

const SAFE_SOURCE_ID = /^src_[a-z0-9][a-z0-9_-]{0,95}$/;
const SAFE_REFERENCE = /^(?:ref|audit|ontology)_[a-z0-9][a-z0-9_-]{0,95}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const BOUNDED_TIMESTAMP = /^(20[0-9]{2}|2100)-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function safeIdentifier(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}

function safeTimestamp(value: unknown): value is string {
  return typeof value === "string" && BOUNDED_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function safeReferences(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 32 && value.every((reference) => safeIdentifier(reference, SAFE_REFERENCE));
}

/**
 * New pack registrations must use an intentionally small provenance schema.
 * It carries only stable identifiers, classifications, bounded timestamps, and
 * opaque references, never source text, paths, URLs, or arbitrary nesting.
 */
export function normalizePackProvenance(value: unknown): PackProvenanceSummary {
  if (!isRecord(value)) throw new PackContractError("pack provenance must be an object");
  const keys = Object.keys(value).sort();
  const expected = ["classification", "importedAt", "references", "sourceId"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new PackContractError("pack provenance has unsupported fields");
  }
  if (!safeIdentifier(value.sourceId, SAFE_SOURCE_ID)) throw new PackContractError("pack provenance sourceId is invalid");
  if (!PACK_PROVENANCE_CLASSIFICATIONS.includes(value.classification as PackProvenanceSummary["classification"])) {
    throw new PackContractError("pack provenance classification is invalid");
  }
  if (!safeTimestamp(value.importedAt)) throw new PackContractError("pack provenance importedAt is invalid");
  if (!safeReferences(value.references)) throw new PackContractError("pack provenance references are invalid");
  return {
    sourceId: value.sourceId,
    classification: value.classification as PackProvenanceSummary["classification"],
    importedAt: value.importedAt,
    references: [...value.references],
  };
}

/**
 * Legacy rows may contain provenance accepted by older releases. Keep only
 * values that independently satisfy the new non-content-bearing schema.
 */
export function scrubLegacyPackProvenance(value: unknown): PackProvenanceSummary | Record<string, never> {
  try {
    return normalizePackProvenance(value);
  } catch {
    return {};
  }
}

export function isSha256Hash(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

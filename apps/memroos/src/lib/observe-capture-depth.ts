/**
 * Observe capture depth policy (v8.16 / OBSERVE-01..03).
 *
 * Default depth is `relevant`. Depth is org/env overridable without schema break.
 */
export type CaptureDepth = "summary" | "relevant" | "full";

export const DEFAULT_CAPTURE_DEPTH: CaptureDepth = "relevant";

export function resolveCaptureDepth(
  requested?: string | null,
  envValue: string | null | undefined = process.env.MEMROOS_CAPTURE_DEPTH
): CaptureDepth {
  const fromRequest = normalizeDepth(requested);
  if (fromRequest) return fromRequest;
  const fromEnv = normalizeDepth(envValue);
  if (fromEnv) return fromEnv;
  return DEFAULT_CAPTURE_DEPTH;
}

function normalizeDepth(value?: string | null): CaptureDepth | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "summary" || v === "relevant" || v === "full") return v;
  return null;
}

export interface CaptureDepthProjectionInput {
  summary?: string;
  decisionIntent?: Record<string, unknown>;
  sources?: unknown[];
  files?: unknown[];
  commands?: unknown[];
  errors?: unknown[];
  verification?: unknown[];
  events?: unknown[];
  transcript?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CaptureDepthProjection {
  depth: CaptureDepth;
  /** Fields safe to derive durable index/candidate content from. */
  indexable: {
    summary: string;
    decisionIntent: Record<string, unknown>;
    sources: unknown[];
    files: unknown[];
    commands: unknown[];
    errors: unknown[];
    verification: unknown[];
  };
  /** Whether full transcript/events may be sealed into the raw vault. */
  sealTranscript: boolean;
  /** Events retained for vault sealing (never for default index). */
  sealedEvents: unknown[];
  sealedTranscript: string | null;
  /** Retention/sensitivity labels for sealed raw payloads. */
  vaultLabel: {
    visibility: "private";
    sensitivity: "credential" | null;
    policy: "sealed";
    retention: "standard" | "full_transcript";
  };
}

/**
 * Apply capture depth before durable candidate generation / vault sealing.
 * Guarantees: `relevant` never indexes full transcript text into candidates.
 */
export function projectCaptureDepth(
  input: CaptureDepthProjectionInput,
  requestedDepth?: string | null
): CaptureDepthProjection {
  const depth = resolveCaptureDepth(requestedDepth);
  const summary = String(input.summary ?? "").trim();
  const decisionIntent = { ...(input.decisionIntent ?? {}) };
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const files = Array.isArray(input.files) ? input.files : [];
  const commands = Array.isArray(input.commands) ? input.commands : [];
  const errors = Array.isArray(input.errors) ? input.errors : [];
  const verification = Array.isArray(input.verification) ? input.verification : [];
  const events = Array.isArray(input.events) ? input.events : [];
  const transcript = typeof input.transcript === "string" ? input.transcript : null;

  if (depth === "summary") {
    return {
      depth,
      indexable: {
        summary,
        decisionIntent: {},
        sources: [],
        files: [],
        commands: [],
        errors: errors.slice(0, 3),
        verification: verification.slice(0, 3),
      },
      sealTranscript: false,
      sealedEvents: [],
      sealedTranscript: null,
      vaultLabel: {
        visibility: "private",
        sensitivity: null,
        policy: "sealed",
        retention: "standard",
      },
    };
  }

  if (depth === "full") {
    return {
      depth,
      indexable: {
        summary,
        decisionIntent,
        sources,
        files,
        commands,
        errors,
        verification,
      },
      sealTranscript: true,
      sealedEvents: events,
      sealedTranscript: transcript,
      vaultLabel: {
        visibility: "private",
        sensitivity: null,
        policy: "sealed",
        retention: "full_transcript",
      },
    };
  }

  // relevant (default): index decisions/actions/errors; never index transcript text.
  return {
    depth: "relevant",
    indexable: {
      summary,
      decisionIntent,
      sources,
      files,
      commands,
      errors,
      verification,
    },
    sealTranscript: false,
    sealedEvents: [],
    sealedTranscript: null,
    vaultLabel: {
      visibility: "private",
      sensitivity: null,
      policy: "sealed",
      retention: "standard",
    },
  };
}

/** True if candidate content looks like a dumped chat transcript. */
export function looksLikeTranscriptDump(content: string): boolean {
  const text = content.toLowerCase();
  const turnMarkers = (text.match(/(?:^|\n)\s*(user|assistant|system)\s*:/g) ?? []).length;
  if (turnMarkers >= 4 && text.length >= 40) return true;
  return turnMarkers >= 6;
}

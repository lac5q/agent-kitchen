/**
 * Constrained LLM classification adjudicator (v8.12 Phase 158 / Slice E).
 *
 * Shadow mode only by default: suggestions are logged for evaluation and must
 * never loosen labels. Fixed provider labels remain authoritative.
 */

export type AdjudicatorDomain =
  | "legal"
  | "finance"
  | "hr"
  | "client"
  | "personal"
  | "engineering";

export type AdjudicatorSensitivity =
  | "pii"
  | "secret"
  | "credential"
  | "privileged"
  | "contract"
  | "payment"
  | "health"
  | null;

export interface AdjudicatorEvidenceSpan {
  reasonCode: string;
  text: string;
  start: number;
  end: number;
}

export interface AdjudicatorSuggestion {
  domain: AdjudicatorDomain | null;
  sensitivity: AdjudicatorSensitivity;
  tighten: boolean;
  abstain: boolean;
  confidence: number;
  reasonCodes: string[];
  evidenceSpans: AdjudicatorEvidenceSpan[];
  model: string;
  shadow: boolean;
}

export interface AdjudicatorInput {
  content: string;
  sourceType: string;
  metadata?: Record<string, unknown>;
  /** Existing deterministic reason codes (fixed labels, scanner, domain). */
  deterministicReasonCodes?: string[];
}

const DOMAIN_HINTS: Array<{ domain: AdjudicatorDomain; pattern: RegExp }> = [
  { domain: "legal", pattern: /\b(nda|attorney|counsel|privileged|litigation|contract)\b/i },
  { domain: "finance", pattern: /\b(invoice|wire|bank|payroll|tax|payment|routing)\b/i },
  { domain: "hr", pattern: /\b(salary|termination|benefits|candidate|performance review)\b/i },
  { domain: "personal", pattern: /\b(family|medical|home address|ssn)\b/i },
];

function hasFixedSensitive(reasonCodes: string[] | undefined): boolean {
  return (reasonCodes ?? []).some((code) => code.startsWith("fixed_label:"));
}

/**
 * Local constrained adjudicator used in shadow mode.
 * Does not call an external model; produces evaluate-able tighten/abstain JSON.
 * External LLM wiring can replace `proposeShadowSuggestion` later without changing callers.
 */
export function proposeShadowSuggestion(input: AdjudicatorInput): AdjudicatorSuggestion {
  const shadow = process.env.MEMROOS_CLASSIFICATION_LLM_SHADOW !== "0";
  const content = input.content ?? "";
  const evidenceSpans: AdjudicatorEvidenceSpan[] = [];
  const reasonCodes: string[] = [];

  if (hasFixedSensitive(input.deterministicReasonCodes)) {
    return {
      domain: null,
      sensitivity: null,
      tighten: false,
      abstain: true,
      confidence: 1,
      reasonCodes: ["abstain_fixed_label_authoritative"],
      evidenceSpans: [],
      model: "shadow-local-v1",
      shadow,
    };
  }

  let domain: AdjudicatorDomain | null = null;
  for (const hint of DOMAIN_HINTS) {
    const match = hint.pattern.exec(content);
    if (!match || match.index < 0) continue;
    domain = hint.domain;
    reasonCodes.push(`shadow_domain:${hint.domain}`);
    evidenceSpans.push({
      reasonCode: `shadow_domain:${hint.domain}`,
      text: match[0].slice(0, 80),
      start: match.index,
      end: match.index + match[0].length,
    });
    break;
  }

  if (!domain || evidenceSpans.length === 0) {
    return {
      domain: null,
      sensitivity: null,
      tighten: false,
      abstain: true,
      confidence: 0,
      reasonCodes: ["abstain_no_evidence_span"],
      evidenceSpans: [],
      model: "shadow-local-v1",
      shadow,
    };
  }

  const sensitivity: AdjudicatorSensitivity =
    domain === "legal" ? "privileged" : domain === "finance" ? "payment" : domain === "hr" || domain === "personal" ? "pii" : null;

  return {
    domain,
    sensitivity,
    tighten: true,
    abstain: false,
    confidence: 0.55,
    reasonCodes: [...reasonCodes, "shadow_tighten_candidate"],
    evidenceSpans,
    model: "shadow-local-v1",
    shadow,
  };
}

/** Apply adjudicator suggestion only when it tightens; never loosen. */
export function canApplyTightenSuggestion(suggestion: AdjudicatorSuggestion): boolean {
  return suggestion.tighten && !suggestion.abstain && suggestion.evidenceSpans.length > 0 && suggestion.confidence >= 0.5;
}

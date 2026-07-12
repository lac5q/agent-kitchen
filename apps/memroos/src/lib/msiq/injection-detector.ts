/**
 * MSIQ-04..05 / ORCH-FOLLOWUP-01 (VAL-ORCH-011): Untrusted content cannot
 * steer orchestration.
 *
 * The detector scans inbound MCP / federated source text for:
 *   - Tool-directive patterns (e.g. "call tool ...", "function_calls",
 *     "<tool_call>...</tool_call>" pseudo-XML, JSON-RPC envelopes).
 *   - Forged-provenance hints (e.g. "trust_level=verified",
 *     "policy_decision=allow", "policy.decision" metadata).
 *   - Credential hints (Bearer tokens, API keys, OAuth blocks).
 *   - Hard prompt-override phrases ("ignore previous instructions",
 *     "system: you are ...", "<|system|>", "[INST]").
 *
 * Detection is data-only: the detector NEVER mutates the source, NEVER
 * executes the matched text, and never writes policy / tool / bound state.
 * It returns a typed disposition so the caller can omit / quarantine per
 * policy. The disposition is recorded as a non-sensitive receipt that
 * contains only counts and pattern codes -- never the offending text.
 */

export type InjectionDisposition =
  | { kind: "clean" }
  | { kind: "omitted"; rules: string[]; score: number }
  | { kind: "quarantined"; rules: string[]; score: number }
  | { kind: "review_required"; rules: string[]; score: number };

const TOOL_DIRECTIVE_PATTERNS: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  { code: "tool_call_xml", pattern: /<\/?tool_call\b[^>]*>/i },
  { code: "tool_call_json", pattern: /"type"\s*:\s*"function"/i },
  { code: "jsonrpc_envelope", pattern: /"jsonrpc"\s*:\s*"2\.0"/i },
  { code: "anthropic_function_calls", pattern: /function_calls?\s*[:=]/i },
  { code: "openai_tool_calls", pattern: /tool_call(?:s)?\s*[:=]/i },
  { code: "explicit_tool_directive", pattern: /\b(?:call|invoke|run|execute)\s+(?:the\s+)?tool\b/i },
];

const PROVENANCE_FORGERY_PATTERNS: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  { code: "trust_level_override", pattern: /\btrust_level\s*[:=]\s*"?verified"?/i },
  { code: "policy_decision_override", pattern: /\bpolicy[_ -]?decision\s*[:=]\s*"?allow"?/i },
  { code: "audit_entry_forge", pattern: /\b(?:audit_entries|audit_log)\.(?:insert|update|delete)\b/i },
  { code: "trust_threshold_override", pattern: /\bmin[_-]?trust[_-]?level\s*[:=]\s*"?unsigned"?/i },
];

const CREDENTIAL_PATTERNS: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  { code: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/ },
  { code: "openai_api_key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { code: "anthropic_api_key", pattern: /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/ },
  { code: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { code: "google_api_key", pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { code: "pem_block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { code: "oauth_block", pattern: /\{[\s\S]*?"access_token"\s*:\s*"[^"]+"\s*[\s\S]*?\}/ },
];

const PROMPT_OVERRIDE_PATTERNS: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  { code: "ignore_previous", pattern: /\bignore (?:all|any|the) (?:previous|prior|above) (?:instructions|rules|directives)\b/i },
  { code: "system_override", pattern: /\bsystem\s*:\s*you (?:are|must|should)\b/i },
  { code: "chatml_system", pattern: /<\|system\|>/i },
  { code: "llama_inst_block", pattern: /\[INST\][\s\S]*?\[\/INST\]/i },
  { code: "developer_directive", pattern: /\bdeveloper mode\b/i },
];

export interface InjectionDetectionResult {
  disposition: InjectionDisposition;
  matchedRules: string[];
  score: number;
  scannedBytes: number;
}

export type InjectionPolicyMode = "omitted" | "quarantined" | "review_required";

function scan(text: string, rules: ReadonlyArray<{ code: string; pattern: RegExp }>): { matched: string[]; score: number } {
  const matched: string[] = [];
  let score = 0;
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      matched.push(rule.code);
      score += 1;
    }
  }
  return { matched, score };
}

/**
 * Scan a text payload for injection / forged-provenance / credential /
 * prompt-override patterns. The returned disposition is the safe projection
 * (counts and codes only) -- never the matched text.
 *
 * The policy-mode argument determines what to do when a match is found:
 *   - `omitted`: drop the result entirely.
 *   - `quarantined`: mark as quarantined but still record a per-source
 *     outcome so the receipt reflects the disposition.
 *   - `review_required`: keep the result behind a review flag so a human
 *     can accept or reject it later.
 *
 * A score >= 2 from any category escalates from omitted -> quarantined ->
 * review_required regardless of the configured mode (fail-closed).
 */
export function detectInjection(
  text: string | null | undefined,
  policyMode: InjectionPolicyMode = "omitted",
): InjectionDetectionResult {
  const scanned = typeof text === "string" ? text : "";
  const scannedBytes = Buffer.byteLength(scanned, "utf8");

  if (scanned.length === 0) {
    return { disposition: { kind: "clean" }, matchedRules: [], score: 0, scannedBytes: 0 };
  }

  const tool = scan(scanned, TOOL_DIRECTIVE_PATTERNS);
  const prov = scan(scanned, PROVENANCE_FORGERY_PATTERNS);
  const cred = scan(scanned, CREDENTIAL_PATTERNS);
  const prompt = scan(scanned, PROMPT_OVERRIDE_PATTERNS);

  const matched = [...tool.matched, ...prov.matched, ...cred.matched, ...prompt.matched];
  const score = tool.score + prov.score + cred.score + prompt.score;

  if (matched.length === 0) {
    return { disposition: { kind: "clean" }, matchedRules: [], score: 0, scannedBytes };
  }

  // Credential matches are always escalated -- regardless of mode.
  if (cred.matched.length > 0) {
    return {
      disposition: { kind: "quarantined", rules: cred.matched, score },
      matchedRules: matched,
      score,
      scannedBytes,
    };
  }
  // Tool directives / forged provenance are escalated to review.
  if (tool.matched.length > 0 || prov.matched.length > 0) {
    return {
      disposition: { kind: "review_required", rules: [...tool.matched, ...prov.matched], score },
      matchedRules: matched,
      score,
      scannedBytes,
    };
  }
  // Prompt-override patterns fall back to the configured policy mode.
  switch (policyMode) {
    case "quarantined":
      return {
        disposition: { kind: "quarantined", rules: prompt.matched, score },
        matchedRules: matched,
        score,
        scannedBytes,
      };
    case "review_required":
      return {
        disposition: { kind: "review_required", rules: prompt.matched, score },
        matchedRules: matched,
        score,
        scannedBytes,
      };
    case "omitted":
    default:
      return {
        disposition: { kind: "omitted", rules: prompt.matched, score },
        matchedRules: matched,
        score,
        scannedBytes,
      };
  }
}

/**
 * Redact the offending text patterns from a payload, replacing matched
 * spans with a fixed sentinel. Returns the redacted string plus the list
 * of matched rule codes. The redacted string is NOT safe to expose to the
 * orchestrator -- it is intended for quarantine storage only.
 */
export function redactInjectionPatterns(
  text: string,
): { redacted: string; matchedRules: string[] } {
  const all = [...TOOL_DIRECTIVE_PATTERNS, ...PROVENANCE_FORGERY_PATTERNS, ...CREDENTIAL_PATTERNS, ...PROMPT_OVERRIDE_PATTERNS];
  let redacted = text;
  const matched: string[] = [];
  for (const rule of all) {
    if (rule.pattern.test(redacted)) {
      matched.push(rule.code);
      redacted = redacted.replace(rule.pattern, "[REDACTED-INJECTION]");
    }
  }
  return { redacted, matchedRules: matched };
}

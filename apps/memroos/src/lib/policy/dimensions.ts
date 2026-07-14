/**
 * Phase 129 (POLGOV-03): Policy dimensions.
 *
 * A dimension rule lets the operator tighten a base decision by matching on
 * `subject` (caller identity), `object` (memory label / vault metadata),
 * `action`, and `purpose`. Dimension rules are ADDITIVE: they can only DENY,
 * and only when ALL the rule's specified fields match the request. They are
 * the input to shadow mode (see `./shadow.ts`) and CI regression corpus
 * (see `__tests__/regression.test.ts`).
 *
 * BYTE-IDENTICAL INVARIANT (carried from Phase 128):
 *   - Dimension matching only runs when `dims` is supplied.
 *   - If `dims` is undefined / empty, NO dimension rule can match a rule that
 *     has ANY specified field (every such rule returns `false`).
 *   - Only an "all fields wildcard" rule (no specified fields anywhere)
 *     matches, and that is unusual / blanket deny territory.
 * Therefore the policy engine keeps the wrapped function's decision
 * byte-identical for every existing caller that does not supply `dimensions`.
 */

// Note: vault / belief vocab enums are intentionally NOT enforced in
// `PolicyObject` / `PolicySubject` fields — dimension rules are JSON-loaded
// and the matcher is string-based. Stronger typing at the request layer
// is the caller's responsibility (see `@/lib/vault/types` and
// `@/lib/recollection-policy`).

/**
 * Subject of a policy request — who is asking.
 *
 * Fields are OR-matched within the rule: e.g. `team: ["GTM", "OPS"]` matches
 * when the request's `subject.team` is "GTM" OR "OPS".
 *
 * The fields are typed as plain `string[]` (not strict enums) because
 * dimension rules are JSON-loaded and the matcher only does string equality
 * + OR. Stronger typing would force an unsafe cast at every JSON boundary.
 */
export interface PolicySubject {
  team?: string[];
  role?: string[];
  userId?: string;
  agentId?: string;
}

/**
 * Object of a policy request — what is being acted upon.
 *
 * Fields are OR-matched within the rule (same semantics as `PolicySubject`).
 * `domain` / `sensitivity` / `visibility` use the canonical vault vocab in
 * the typed callers, but JSON-loaded rule shapes (manifests) carry plain
 * `string[]`; the matcher is string-based so both shapes work.
 */
export interface PolicyObject {
  ontologyType?: string[];
  domain?: readonly string[];
  sensitivity?: readonly string[];
  visibility?: readonly string[];
  beliefStage?: readonly string[];
}

/** Action identifier. Stringly-typed to keep the rule surface flexible. */
export type PolicyDimensionAction = string;

/** Purpose identifier. Stringly-typed to keep the rule surface flexible. */
export type PolicyDimensionPurpose = string;

/**
 * A single dimension rule. `effect` is intentionally restricted to `"deny"`
 * in this phase: additive tightening only. Loosening (allow rules) is out
 * of scope — it would break the byte-identical contract for existing
 * decisions.
 */
export interface PolicyDimensionRule {
  subject?: PolicySubject;
  object?: PolicyObject;
  action?: PolicyDimensionAction[];
  purpose?: PolicyDimensionPurpose[];
  effect: "deny";
}

/**
 * Per-request dimensions. Mirrors the rule shape minus `effect`. All fields
 * are optional so a caller can supply only the slices they have.
 */
export interface PolicyRequestDimensions {
  subject?: PolicySubject;
  object?: PolicyObject;
  action?: PolicyDimensionAction;
  purpose?: PolicyDimensionPurpose;
}

/**
 * Match a rule against the request dimensions.
 *
 * Semantics:
 *   - Missing rule fields are wildcards (always match).
 *   - Missing request dimensions (subject / object undefined) cause ANY rule
 *     with a specified subject or object field to NOT match — preserves the
 *     byte-identical contract.
 *   - Arrays are OR-matched: rule `team: ["GTM", "OPS"]` matches a request
 *     with `subject.team: "GTM"`.
 *   - Scalar fields (userId, agentId, action, purpose) match on equality.
 *   - A rule with NO specified fields anywhere matches everything — that is
 *     a blanket deny and intentionally rare; callers must opt in.
 *
 * Returns `false` for every supplied-but-empty rule field so an empty `team`
 * array can never accidentally become a wildcard.
 */
export function matchDimensions(
  rule: PolicyDimensionRule,
  dims: PolicyRequestDimensions | undefined
): boolean {
  // No dimensions supplied at all -> no dimension rule with any specified
  // field can match. An "all-wildcard" rule (no specified fields anywhere)
  // still matches.
  if (!dims) {
    return (
      rule.subject === undefined &&
      rule.object === undefined &&
      rule.action === undefined &&
      rule.purpose === undefined
    );
  }

  // Subject match.
  if (rule.subject !== undefined) {
    if (dims.subject === undefined) return false;
    if (!matchSubject(rule.subject, dims.subject)) return false;
  }

  // Object match.
  if (rule.object !== undefined) {
    if (dims.object === undefined) return false;
    if (!matchObject(rule.object, dims.object)) return false;
  }

  // Action match.
  if (rule.action !== undefined && rule.action.length > 0) {
    if (dims.action === undefined) return false;
    if (!rule.action.includes(dims.action)) return false;
  }

  // Purpose match.
  if (rule.purpose !== undefined && rule.purpose.length > 0) {
    if (dims.purpose === undefined) return false;
    if (!rule.purpose.includes(dims.purpose)) return false;
  }

  return true;
}

function matchSubject(rule: PolicySubject, req: PolicySubject): boolean {
  if (rule.team !== undefined && rule.team.length > 0) {
    if (req.team === undefined) return false;
    // `req.team` may be a single string in some shapes, but the type here
    // is `string[]`. Treat single value as a one-element array.
    const reqTeams = Array.isArray(req.team) ? req.team : [req.team as unknown as string];
    if (!rule.team.some((value) => reqTeams.includes(value))) return false;
  }

  if (rule.role !== undefined && rule.role.length > 0) {
    if (req.role === undefined) return false;
    const reqRoles = Array.isArray(req.role) ? req.role : [req.role as unknown as string];
    if (!rule.role.some((value) => reqRoles.includes(value))) return false;
  }

  if (rule.userId !== undefined && rule.userId !== req.userId) {
    return false;
  }

  if (rule.agentId !== undefined && rule.agentId !== req.agentId) {
    return false;
  }

  return true;
}

function matchObject(rule: PolicyObject, req: PolicyObject): boolean {
  if (rule.domain !== undefined && rule.domain.length > 0) {
    if (req.domain === undefined) return false;
    const reqDomains = Array.isArray(req.domain) ? req.domain : [req.domain as unknown as string];
    if (!rule.domain.some((value) => reqDomains.includes(value))) return false;
  }

  if (rule.sensitivity !== undefined && rule.sensitivity.length > 0) {
    if (req.sensitivity === undefined) return false;
    const reqSensitivities = Array.isArray(req.sensitivity)
      ? req.sensitivity
      : [req.sensitivity as unknown as string];
    if (!rule.sensitivity.some((value) => reqSensitivities.includes(value))) return false;
  }

  if (rule.visibility !== undefined && rule.visibility.length > 0) {
    if (req.visibility === undefined) return false;
    const reqVisibilities = Array.isArray(req.visibility)
      ? req.visibility
      : [req.visibility as unknown as string];
    if (!rule.visibility.some((value) => reqVisibilities.includes(value))) return false;
  }

  if (rule.beliefStage !== undefined && rule.beliefStage.length > 0) {
    if (req.beliefStage === undefined) return false;
    const reqStages = Array.isArray(req.beliefStage)
      ? req.beliefStage
      : [req.beliefStage as unknown as string];
    if (!rule.beliefStage.some((value) => reqStages.includes(value))) return false;
  }

  if (rule.ontologyType !== undefined && rule.ontologyType.length > 0) {
    if (req.ontologyType === undefined) return false;
    const reqTypes = Array.isArray(req.ontologyType)
      ? req.ontologyType
      : [req.ontologyType as unknown as string];
    if (!rule.ontologyType.some((value) => reqTypes.includes(value))) return false;
  }

  return true;
}
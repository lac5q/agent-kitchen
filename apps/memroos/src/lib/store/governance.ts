/**
 * STORE-01 — the governance contract for the data-access chokepoint.
 *
 * `lib/store/**` is the only place allowed to import `better-sqlite3`
 * (enforced by `scripts/check-sqlite-allowlist.mjs`). The reason for the
 * chokepoint is not tidiness: it is that a write which nobody can attribute
 * is a hole in the audit trail, and holes are invisible by construction. So
 * every write helper in this directory takes a `GovernanceContext` as a
 * *required* argument. Omitting it is a type error, which is the property the
 * phase is buying — "a new domain cannot write to SQLite without emitting an
 * audit event, because the API offers no other path."
 *
 * Reads deliberately do not require a context. STORE-01 scopes the requirement
 * to write paths, and forcing ceremony onto every SELECT would push callers
 * back toward reaching around the store layer.
 *
 * Field mapping to the existing `audit_log` table:
 *
 *   actor    -> actor
 *   action   -> action
 *   asset    -> target
 *   label    -> visibility / domain / sensitivity / policy (added by
 *               `addSecurityLabelColumns` in db-schema.ts)
 *   purpose  -> detail (JSON)
 *   decision -> detail (JSON)
 *
 * `purpose` and `decision` share `detail` because `audit_log` has no column
 * for either. Giving them real columns means touching `db-schema.ts`, which is
 * STORE-02, so they are carried as structured JSON here rather than dropped
 * from the type — the type is the contract, and weakening it to match today's
 * schema would defeat the gate. Anything that needs to *query* by decision
 * should wait for STORE-02 rather than string-matching `detail`.
 */

import type Database from "better-sqlite3";

/** Security label carried on every governed write. Mirrors the label columns. */
export interface SecurityLabel {
  visibility: "private" | "internal" | "team" | "public";
  domain?: string | null;
  sensitivity?: "low" | "medium" | "high" | null;
  policy: string;
}

/**
 * Who did what, to what, why, under which label, and what was decided.
 *
 * Required on every write helper exported from `lib/store/**`.
 */
export interface GovernanceContext {
  /** Stable id of the human, agent, or system process performing the write. */
  actor: string;
  /** Verb phrase naming the operation, e.g. `connector.record.write`. */
  action: string;
  /** What is being written — table, row id, or a domain-meaningful handle. */
  asset: string;
  /** Why this write is permitted to happen. Free text, kept short. */
  purpose: string;
  /** Security label applied to the written row. */
  label: SecurityLabel;
  /** Outcome of the policy evaluation that authorised this write. */
  decision: "allow" | "deny";
}

/** A system-initiated write with no human actor (startup backfills, syncs). */
export function systemGovernance(
  action: string,
  asset: string,
  purpose: string,
): GovernanceContext {
  return {
    actor: "system",
    action,
    asset,
    purpose,
    label: { visibility: "private", policy: "sealed" },
    decision: "allow",
  };
}

/**
 * Records one governed write against `audit_log`.
 *
 * Never throws: an audit failure must not roll back the primary write, which
 * matches the pre-existing `writeAuditLog` contract in `lib/audit.ts`. A
 * `deny` decision is still recorded — refusals are the entries an auditor
 * most wants, and dropping them would make the log describe only successes.
 */
export function recordGovernedWrite(
  db: Database.Database,
  ctx: GovernanceContext,
): void {
  try {
    db.prepare(
      `INSERT INTO audit_log
         (actor, action, target, detail, severity, visibility, domain, sensitivity, policy)
       VALUES (@actor, @action, @target, @detail, @severity, @visibility, @domain, @sensitivity, @policy)`,
    ).run({
      actor: ctx.actor,
      action: ctx.action,
      target: ctx.asset,
      detail: JSON.stringify({ purpose: ctx.purpose, decision: ctx.decision }),
      severity: ctx.decision === "deny" ? "medium" : "info",
      visibility: ctx.label.visibility,
      domain: ctx.label.domain ?? null,
      sensitivity: ctx.label.sensitivity ?? null,
      policy: ctx.label.policy,
    });
  } catch {
    // Matches lib/audit.ts: never let the audit write break the primary action.
    console.error("[store] governance record failed:", ctx.action, ctx.asset);
  }
}

/**
 * Runtime guard for the boundary the type system already enforces.
 *
 * The compile-time requirement is the real control, but a JavaScript caller
 * (or an `as any` cast) can still slip past it, and a gate that has never been
 * seen to fail is not known to work. Write helpers call this first.
 */
export function assertGovernance(ctx: GovernanceContext): void {
  const missing = (["actor", "action", "asset", "purpose", "decision"] as const).filter(
    (k) => typeof ctx?.[k] !== "string" || ctx[k].trim() === "",
  ) as string[];
  if (
    !ctx?.label ||
    typeof ctx.label.visibility !== "string" ||
    typeof ctx.label.policy !== "string"
  ) {
    missing.push("label");
  }
  if (missing.length > 0) {
    throw new Error(
      `ungoverned write rejected — missing governance field(s): ${missing.join(", ")}`,
    );
  }
}

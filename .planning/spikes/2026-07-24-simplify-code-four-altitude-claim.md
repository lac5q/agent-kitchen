# Simplify-Code Four-Altitude / Architecture Reviewer Claim Spike

Requirement: `SIMPLIFY-FOLLOWUP-01`

Status: completed bounded spike, 2026-07-24

## External Signal

An X "Hermes Agent Tip of the Day" post (shared by Luis in Discord
#memroos, 2026-07-24) claims:

> "The updated simplify-code skill now includes a fourth high-level reviewer
> specifically to catch those architectural issues."
>
> "Line level … Function level … Module level … Architecture level"

The post frames the simplification ladder as four altitudes a reviewer
should cover: line, function, module, architecture, and asserts the
Hermes `simplify-code` skill has been updated to ship all four.

This is a third-party "Tip of the Day" packaging. The underlying source
the post refers to is the Hermes Agent skill
`software-development/simplify-code` in this install
(`~/.hermes/hermes-agent/skills/software-development/simplify-code/SKILL.md`).

### Promoter-vs-source split

| Promoter says | Underlying source says | Verdict |
|---------------|------------------------|---------|
| "Updated simplify-code skill" — implies a recent change adding a 4th reviewer. | Frontmatter description: `Parallel 3-agent cleanup of recent code changes.` Phase 2 heading: `Launch three reviewers in parallel`. Pitfall: `Don't fan out wider than ~3. More reviewers means more cost and more conflicting suggestions to reconcile, not better coverage. Three categories cover the space.` | 🔴 Speculation. The skill explicitly says three reviewers and warns against going wider. |
| Four altitudes (line/function/module/architecture) are all covered. | Three named reviewers: Reuse, Code Quality, Efficiency. Quality covers some line/function/module concerns (parameter sprawl, copy-paste, leaky abstractions, AI-slop patterns). **No architecture reviewer exists.** Architecture-level review is intentionally out of scope. | ⚠️ Inference for line/function/module (partial coverage via Quality). 🔴 Speculation for architecture. |
| "That's where the magic happens — challenge the overall design." | The skill points architecture-level work elsewhere: `requesting-code-review` for the pre-commit gate; `subagent-driven-development` for in-loop review; `.code-review/ARCHITECTURE-REVIEW.md` + Phase 115 (`ARCHREV-03`) on the memroos side. | ✅ Verified — but the skill does not claim to do this; other skills do. |

Marketing framing the post adds that the skill does not support:

- "Sometimes the entire abstraction is wrong." → true, but the skill
  explicitly scopes out architectural redesign ("Apply ≠ rewrite … not
  a license to refactor the whole module").
- "Don't just ask AI to make your code prettier. Ask it to make your
  software better." → aspirational; not what this skill ships.

## Repo Baseline

memroos already separates the four altitudes into distinct artifacts:

- **Line/function/module** → `software-development/simplify-code` (3
  parallel reviewers: Reuse, Quality, Efficiency; this install ships
  exactly that and says so).
- **Architecture** → `requesting-code-review` (pre-commit security /
  quality gate) + `subagent-driven-development` (per-task in-loop
  review) + `.code-review/ARCHITECTURE-REVIEW.md` (memroos system-level
  prose review) + Phase 115 `ARCHREV-03` (first contained hardening
  slice; v7.2 Architecture Review Hardening, completed 2026-06-27).
- **Cross-cutting concerns** (no architecture reviewer covers them in
  the post): performance, security, dependency churn, public-contract
  breaks → handled by `simplify-code` Reviewer 3 (Efficiency) and
  `requesting-code-review` independently.

The repo's own decision history (Phase 115) is that architecture review
deserves its own phase, not a 4th reviewer bolted onto a cleanup pass.

## Comparison Result

Strongest transferable pieces of the post:

- The altitude ladder (line → function → module → architecture) is a
  useful *mental model* for asking any reviewer the right question —
  "are you noticing an ugly function or a wrong abstraction?" Worth a
  one-paragraph note in the simplify-code skill's `## When to Use`
  block, but only as a mental model — not as a new reviewer.
- The closing line ("Don't just ask AI to make your code prettier. Ask
  it to make your software better.") is a useful piece of voice for a
  user-facing blurb on the skill frontmatter, but does not change
  behavior.

Weakest claims:

- The skill was not updated to ship a 4th reviewer. This install's
  `simplify-code/SKILL.md` is `version: 1.0.0`, dated to the original
  parallel-3-agent design, with an explicit pitfall against going
  wider than 3.
- Adding an architecture reviewer to a parallel-3-agent cleanup pass
  *contradicts* the skill's own design principle. The skill is meant
  for *recent change cleanup*, not system redesign; the post itself
  even says so ("Sometimes the entire abstraction is wrong … not just
  the implementation"). The right answer when the abstraction is wrong
  is a new phase (`gsd-discuss-phase` → `gsd-plan-phase` →
  `gsd-execute-phase`), not a 4th reviewer in a subagent batch.
- Adding a 4th reviewer doubles the diff cost and the conflict-reconciliation
  load without changing the coverage model, because the architecture
  question (do we have the right abstraction at all?) is orthogonal to
  the cleanup question (is this change well-written?) and deserves its
  own context, its own prompt, and its own user-facing signal — not
  another agent in the same batch.

The safe test lane for any future adoption, if pursued, is:

- A one-paragraph altitude-ladder note added to `simplify-code`'s
  `## When to Use` block (mental model only; no new reviewer).
- A `gsd-review-architecture` follow-up skill that explicitly *is* the
  architecture reviewer the post describes, with its own process,
  prompts, and conflict-resolution rules. That belongs in a new
  approval-gated phase, not a patch to `simplify-code`.

## Decision

Do not add a 4th architecture reviewer to `simplify-code`. Do not
rewrite the skill's three-reviewer design around the four-altitude
ladder. Do not treat the post as evidence that the skill already
shipped that change — it hasn't, in this install or in any release we
have record of.

The transferable lessons worth capturing:

- The four-altitude mental model is worth a one-paragraph note in the
  simplify-code skill (line/function/module covered by Quality;
  architecture explicitly out of scope, point at
  `requesting-code-review` and Phase 115 ARCHREV).
- A future approval-gated phase could add a separate
  `gsd-review-architecture` skill if the operator wants an in-loop
  architecture review path. That is a new skill, new requirement IDs,
  and a PLAN — not a follow-up to this spike.

## Guardrails

- No new architecture reviewer added to `simplify-code`.
- No fan-out beyond 3 parallel reviewers in `simplify-code` (the
  skill's own pitfall holds).
- No rewrite of the simplify-code skill's three-category coverage model
  (Reuse / Quality / Efficiency) without an approval-gated follow-up
  phase and new `*-IMPL-NN` requirement IDs.
- No claim that the simplify-code skill currently includes a 4th
  architecture reviewer. Citing the X post as evidence of that
  addition is rejected.
- No refactor of `simplify-code` to align with the post's framing
  outside an approval-gated change.
- Architecture review remains routed to `requesting-code-review`,
  `subagent-driven-development`, and (on memroos)
  `.code-review/ARCHITECTURE-REVIEW.md` + Phase 115 `ARCHREV-03`.

## Verification

Bounded spike artifact is checked by `npm run check:future-spikes`.
Proposal-mode adoption is blocked until a follow-up phase adds
`SIMPLIFY-IMPL-01..N` requirements and a PLAN.md.
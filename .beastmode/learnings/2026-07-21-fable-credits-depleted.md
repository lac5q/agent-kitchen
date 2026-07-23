# Beastmode Learning: Validator substitution history (2026-07-21)

Date: 2026-07-21
Session: Phase 177 closeout → Phase 176 first session (consolidated run)
Trigger: Anthropic API credit balance = 0 → claude-fable-5 lane dead

## Substitution chain (chronological — preserve order on rollback)

| # | Date | Validator | Lane | Reason | Action taken |
|---|------|-----------|------|--------|---------------|
| 0 | earlier session | claude-fable-5 (Anthropic API) | direct | default Beastmode verifier | Fable Rounds 1–6 PASS — Phase 177 closed at ~20:59 UTC |
| 1 | 21:53 UTC | claude-fable-5 → claude-opus-4-8 (Pro lane) | `claude -p --model opus --effort high` | Anthropic API returned HTTP 400 "credit balance too low" | bin/beast-validator (Opus-on-Pro) created; smoke test PASS |
| 2 | ~21:55 UTC | claude-opus-4-8 → codex gpt-5.6-terra (OAuth) | `codex exec --model gpt-5.6-terra --reasoning-effort high` | user override | bin/beast-validator rewired; default effort HIGH; floor MEDIUM (low refused); smoke test PASS |

bin/beast-fable kept as the future-restoration hook — once Anthropic credits
return, swap the symlink: `ln -sf bin/beast-fable bin/beast-validator`.

## Why this matters

The Beastmode skill (`beastmode-pi`) mandates verifier-first:
"cheap lane with a cheap verifier always wins over a frontier lane doing the
same work." Fable was the cheapest reliable verifier; Opus-on-Pro was the
escalation; codex gpt-5.6-terra HIGH is a *different* class (not strictly
cheaper, but a different rate-limit pool, so it isn't blocked by either
Fable's API credits OR Opus-on-Pro's subscription quota).

Each substitution was logged because:
- dropping Fable without notice would have violated the verifier-first rule;
- substituting Opus without notice would have silently changed the
  adversarial ceiling without recording the route-rule delta;
- substituting codex silently would have done the same AND moved off the
  Claude family entirely, breaking continuity with the prior 6 Fable rounds.

## New rule captured

> "Every time a goal/plan file changes, run `bin/beast-todo-sync <file>`
>  before the next tool call." — see `bin/beast-todo-sync`.

Rationale: I had drifted between multiple disjoint todo lists during the
Phase 177 run (preservation step, install steps, deployment steps, closeout
steps, Fable rounds) and the user flagged that the live todo list was
desynced from the GOAL.md acceptance contract. The script reads
`## / ### / ####` headings and emits matching todo create calls, so any
scope change can be regenerated in seconds.

## Round-0 verifier run (Codex gpt-5.6-terra HIGH)

Run against the consolidated GOAL.md: returned PASS on sequencing, branch
strategy (single workstream `install-repro-connmem-bridge`), highest-risk
item (GitHub push auth unknown), scope-drift watch (bundling the lessons
capture with the connmem commits).

## Restoration plan

When Anthropic credits return:
1. Verify `curl https://api.anthropic.com/v1/messages -H "x-api-key: …"` returns 200.
2. `ln -sf bin/beast-fable bin/beast-validator` (swap back).
3. bin/beast-fable already retains the messages-API client, the medium-effort
   floor, and the trace.jsonl append. No wrapper changes needed.
4. Add an entry to the substitution-history table above.
5. Re-run Round-0 on the new validator to confirm parity (Fable Rounds 1–6
   baselines are in `.beastmode/worker-runs/20260721T*` if a parity diff is
   needed).

## Autonomy level: HIGH

Effective 2026-07-21 in response to the user directive "set beastmode to
high autonomy" mid-consolidated-run.

Under HIGH autonomy the implementation is authorized to:
- Run pre-push gates (install-regression --fast, vitest fast + slow,
  typecheck + injection sanity, lint, validator audit) without a
  per-gate sign-off from the user.
- Decide when to commit, branch-cut, defer, or escalate on the
  director's own judgment.
- Apply the Fable/Codex verifier rule on every state-changing
  decision (no fabrication of "validated" verdicts).
- Pair every commit / verification step / validator round with an
  immediate `todo update` — explicitly per the user's "remmeber to
  updat the todos along the way" discipline note (same session).

HIGH autonomy does NOT override:
- Hard rules: never push with a failing pre-push gate; never commit a
  scope that contradicts the gate.
- The verifier-first rule: cheap Claude Fable (or codex substitute)
  validates; never claim validation without a verifier round.
- The "no silent credential exfil" rule: API keys stay in env, never
  in commits.

## Autonomy level: HIGH

Effective 2026-07-21 in response to the user directive "set beastmode to
high autonomy" mid-consolidated-run.

Under HIGH autonomy the implementation is authorized to:
- Run pre-push gates (install-regression --fast, vitest fast + slow,
  typecheck + injection sanity, lint, validator audit) without a
  per-gate sign-off from the user.
- Decide when to commit, branch-cut, defer, or escalate on the
  director's own judgment.
- Apply the Fable/Codex verifier rule on every state-changing
  decision (no fabrication of "validated" verdicts).
- Pair every commit / verification step / validator round with an
  immediate `todo update` — explicitly per the user's "remmeber to
  updat the todos along the way" discipline note (same session).

HIGH autonomy does NOT override:
- Hard rules: never push with a failing pre-push gate; never commit a
  scope that contradicts the gate.
- The verifier-first rule: cheap Claude Fable (or codex substitute)
  validates; never claim validation without a verifier round.
- The "no silent credential exfil" rule: API keys stay in env, never
  in commits.

## Followup 2: oracle-1 deploy deferral (2026-07-22)

User confirmed mid-run: do NOT install / re-run / re-rotate anything
on oracle-1. They wanted the host at "latest code" (which it is — main @
origin/main HEAD = bb6d4583, no divergence) but to leave the existing
data state untouched. So the oracle-1 deploy remains:
- HEAD: bb6d4583 (matches origin/main, 0 commits behind)
- No docker stack running (ps empty)
- .env (if any) is the preinstall backup; not rotated
- Multi-arch image build still tracked as a future work item

This is a valid deployment state for the oracle-1 host. The `oracle-1
BLOCKED` note is now narrower: it's blocked on first-install
provisioning (network pull, credential rotation, image-build), not on
the source code on disk.

The DEPLOY2 todos (oracle-1 work) created in the last turn are now
mis-scoped: the user wanted code-only, not install. Closing them all
as not-applicable; the deliverable is "oracle-1 source is at HEAD"
which is already done.

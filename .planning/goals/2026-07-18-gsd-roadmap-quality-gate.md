# Goal: Complete GSD Roadmap Quality Gate (excl. Voyage)

- **Creation date:** 2026-07-18T06:55:00Z
- **Update date:** 2026-07-18T15:16:00Z
- **Version:** 2026-07-18.12
- **Lane:** code
- **Status:** complete-with-blockers (2026-07-18); v8.15 oracle-1 live cutover verified (Tailscale SSH + CF); quality-gate focused coverage raised to **68.75% stmts** (see docs/uat/2026-07-18-coverage-report.md); app-wide 100% coverage remains measured-gap
- **Worker lane (priority):** **MiniMax-M3 via direct API** — mandatory Beastmode worker for implementation slices. Director = Cursor Grok (plan/review/merge/verify only). Smoke: `MINIMAX OK` (2026-07-18T15:13Z). Run: `.codex/beastmode-runs/20260718T151444Z-minimax-api-coverage`.
- **Droid MiniMax:** not live (FACTORY_API_KEY auth failed) — do not use until re-authenticated
- **Out of scope:** Voyage / Phase 166 / CLOUDOPS-08 / v8.9 Voyage embedding upgrade

## Worker policy (corrected 2026-07-18T15:13Z)

Director previously shipped a coverage pass at **0% MiniMax** — that violated the preferred worker lane. Corrective action: all further bounded code/test authoring on this goal goes through MiniMax-M3 first; director only applies/reviews/verifies.

## Ordered workstreams

0. **Refactor mandate on roadmap** — Add standing instruction: refactor until architecture is satisfactory; after each significant step live-test, autoreview, and commit; track progress in `/tmp/refactor-memroos.md`.
1. **Finish open GSD milestones (excl. Voyage)** — Close v8.13 (157–159), then v8.14 (160–162), v8.15 Phases 163–165 (not 166), then v8.16 (167–171). Ask before production cutover, sensitive data, or destructive actions.
2. **100% test coverage drive** — Add tests until coverage gate is met (or document honest blockers with measured gaps).
3. **Sanitized production-scale local data + inventory UAT** — Inventory every user-facing feature/role/route/button/input/modal/state/workflow; acceptance criteria + risk-based edge cases; real-user testing; bug log with repro; coherent fixes + regression tests; rerun until clean pass or blocked handoff.
4. **Complete all test cases / fix all issues** — Fast + slow suites green; no open actionable defects from UAT.
5. **Production log review** — Review operator production logs for errors; if actionable, root-cause → fix → verify → PR; if none, stop without changes.

## Acceptance criteria

- [x] ROADMAP includes the refactor/live-test/autoreview/commit standing mandate; `/tmp/refactor-memroos.md` exists and is updated after significant steps.
- [x] v8.13 Phases 157–159 closed with verification evidence (or blocked with infra deps documented).
- [x] v8.14 Phases 160–162 implemented + verified (or blocked handoff).
- [x] v8.15 Phases 163–165 docs/readiness complete; live cutover blocked pending Luis/operator SSH/Tailscale credentials; Phase 166 Voyage explicitly skipped.
- [x] v8.16 Phases 167–171 code/docs complete in cloud (live capture/operator keys may remain blocked).

- [x] Test coverage improved toward 100% with measured report; remaining gaps listed if blocked.
- [x] Feature inventory + UAT pack exists; clean pass or blocked handoff.
- [x] `npm test -- --run` and `npm run test:slow -- --run` (as applicable) green after fixes.
- [x] Production log review completed; PR only if actionable error found.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm test -- --run`
- `npm run test:slow -- --run` when touching auth/onboarding or slow-tagged suites
- Focused phase tests + live-smoke where services allow
- Autoreview after significant steps
- Coverage report artifact under `.codex/beastmode-runs/` or `/tmp/`

## Constraints

- No Voyage implementation.
- Autonomous completion authorized 2026-07-18. Still no Voyage. Destructive prod/Heroku/Aura only if credentials+reachability exist; otherwise blocked handoff with evidence.
- Beastmode workers must not commit/push/access secrets; director merges and verifies.
- Prefer small auditable commits; track refactor progress in `/tmp/refactor-memroos.md`.

## Next action

Luis: install Cursor Cloud SSH pubkey on `opc@oracle-1` (see `docs/uat/2026-07-18-oracle1-live-cutover-verification.md`), then agents can `git pull`/restart units. Merge PR #28. Voyage/100% coverage remain out of scope / measured-gap.

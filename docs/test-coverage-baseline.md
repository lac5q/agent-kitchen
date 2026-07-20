# Test coverage baseline (Mission 1.2 + 1.3)

Generated 2026-07-18 against `apps/memroos` on `main` (commit 48bc3cc).
Tool: `vitest run --coverage --coverage.provider=v8`.
Scope: `apps/memroos/src/lib`, `apps/memroos/src/app`, `apps/memroos/src/components`.
Fast split only (excludes `slow`-tagged tests per AGENTS.md).

## Mission 1.2 — `src/lib`

| Metric | Baseline | Target | Status |
| --- | --- | --- | --- |
| Lines | **89.4%** (14,795 / 16,552) | 80% | PASS (+9.4pp) |
| Branches | **74.5%** (11,411 / 15,319) | 70% | PASS (+4.5pp) |
| Functions | 93.3% (3,243 / 3,474) | - | - |
| Statements | 86.4% (16,010 / 18,536) | - | - |

**Verdict: target met on fast split. No additional tests required for M1.2.**

75 files in `src/lib` are still below the 80/70 line/branch target. Twelve are
at 0% line coverage (`agent-onboarding.ts`, `parsers.ts`, `scheduler-singleton.ts`,
`schema.tsx`, `export/cli.ts`, and seven `l3/adapters/*.ts` files). These are
either dead-code, integration-only adapters, or scripts that are not exercised
by unit tests. Raising their coverage is a separate, low-ROI task that should
not block further milestones.

## Mission 1.3 — `src/app` + `src/components`

| Metric | Baseline | Target | Status |
| --- | --- | --- | --- |
| Lines | **66.4%** (6,310 / 9,499) | 80% | MISS (-13.6pp) |
| Branches | **55.9%** (6,126 / 10,952) | 70% | MISS (-14.1pp) |
| Functions | 65.4% (1,432 / 2,188) | - | - |
| Statements | 64.2% (6,793 / 10,575) | - | - |

**Verdict: target missed. 228 files below target, 127 at 0% line coverage.**
The 0%-coverage tail is dominated by Next.js App-Router route handlers
(`src/app/api/**/route.ts`) plus framework boundary files (`layout.tsx`,
`page.tsx`, `error.tsx`, `loading.tsx`, `not-found.tsx`, `sitemap.ts`,
`providers.tsx`).

## Recommended sequenced milestones to close M1.3 (future work)

| Slice | Approx files | Coverage delta estimate | Notes |
| --- | --- | --- | --- |
| M1.3.a - Framework boundary files | ~9 | +1.5pp lines | Trivial: render-test each in jsdom. Pure boilerplate, low signal. |
| M1.3.b - Auth API routes | ~7 | +2.5pp lines | Most already have adjacent test scaffolding. |
| M1.3.c - Memory + L3 API routes | ~25 | +4pp lines | Heaviest concentration of 0%-coverage handlers. |
| M1.3.d - Onboarding + seal API routes | ~15 | +3pp lines | Routes often rely on slow-tagged tests; coordinate with slow split. |
| M1.3.e - Operator console page.tsx + components | ~80 | +3pp lines | Mostly render tests; lower ROI per file. |
| M1.3.f - Remaining API routes | ~95 | +1pp lines | Long tail. |

End-state estimate: full M1.3 sweep is roughly 6 milestones of focused work
spanning ~15,000 LoC of new tests. Likely multi-day, not in-session.

## Notes

- Coverage thresholds were intentionally not added to `vitest.config.ts` so
  CI does not regress while the sweep is in progress.
- Re-run baseline at any time with:
  - Fast: `cd apps/memroos && npx vitest run --coverage --coverage.provider=v8 --coverage.include='src/lib/**' --coverage.reportsDirectory=coverage/lib`
  - App + components: `cd apps/memroos && npx vitest run --coverage --coverage.provider=v8 --coverage.include='src/app/**' --coverage.include='src/components/**' --coverage.reportsDirectory=coverage/app`
- 73 pre-existing lint warnings are unrelated to coverage.

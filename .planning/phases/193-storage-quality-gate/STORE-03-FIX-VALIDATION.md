## Validation Report store-03-fix

### Commands + exit codes

| Command | Exit | Result |
| --- | ---: | --- |
| `npm run check:sqlite-allowlist` | 0 | 113 direct importers, baseline 113; regression subtests 4/4 passed |
| `MEMROOS_VAULT_ROOT=$(mktemp -d) npm test -- --run` | 0 | 3,765 passed / 3,798 total; 33 skipped; 444 test files passed, 1 skipped |
| `npm run typecheck` | 0 | Passed |
| `npm --prefix apps/memroos run lint -- src/lib/store/memory.ts src/lib/memory/belief-promotion-scheduler.ts src/lib/memory/salience.ts src/lib/memory/save-enrichment.ts` | 0 | Passed; 0 errors |
| `npm run check:lib-boundary` | 0 | 53 root-level files, baseline 53; regression subtests 3/3 passed |
| `git diff --check` | 0 | Passed |

Focused Phase 193 suites also passed: 36/36 tests across the belief-promotion, salience migration, and memory-add route suites.

### Store call map

| Source file | Store function(s) it now calls | Governed |
| --- | --- | --- |
| `src/lib/memory/belief-promotion-scheduler.ts` | `listBeliefPromotionCandidates` | n (read) |
| `src/lib/memory/salience.ts` | `memorySalienceTableExists`, `initializeMemorySalience`, `reinforceMemorySalience` | n (read); y (writes) |
| `src/lib/memory/save-enrichment.ts` | `listMemoryEnrichmentCaptures`, `getMemoryEnrichmentCapture`, `getMemoryWriteResult`, `findMemoryCandidateByCaptureHash` | n (reads) |
| `src/lib/memory/save-enrichment.ts` | `createMemoryEnrichmentCapture`, `updateMemoryEnrichmentCapture`, `updateMemoryWriteResult`, `createMemoryCandidate`, `withMemoryEnrichmentTransaction` | y |

Every new store write helper requires `GovernanceContext` and calls `assertGovernance`; read helpers do not require governance. The three source modules no longer import `better-sqlite3` or issue raw SQLite prepares/transactions.

### Allowlist baseline

| State | Allowlist entries | Baseline | Gate |
| --- | ---: | ---: | --- |
| Before | 113 | 113 | Exit 1 only because the three new Phase 193 files were unlisted violations |
| After | 113 | 113 | Exit 0 |

The allowlist file and baseline were not changed or enlarged.

### Test expectations

No test expectation or test file was changed. The full suite passed without expectation edits.

### Escalations

- No functional escalation.
- GitNexus has duplicate indexed repository paths and its snapshot predates these Phase 193 symbols. Final `detect_changes` saw 4 changed files, 0 indexed changed symbols/processes, and low risk; live gates and tests are the authoritative validation.
- No commit was created.

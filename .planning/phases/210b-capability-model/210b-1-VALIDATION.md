## Validation Report phase-210b-1

Scope was limited to 210b-1. `proxy.ts` was not changed. No commit or push was
created in this worktree.

### Commands + exit codes; tests passed/total; typecheck/lint

| Command | Exit | Result |
| --- | ---: | --- |
| `MEMROOS_VAULT_ROOT=$(mktemp -d) npm test -- --run` | 0 | 441 test files passed, 1 skipped; 3,753 tests passed, 33 skipped (3,786 total) |
| `npm test --workspace apps/memroos -- --run src/lib/auth/__tests__/capabilities.test.ts` | 0 | 7/7 passed |
| `npm run check:role-rank-callsites` | 0 | Gate passed at 65/65; fixture suite 4/4 passed |
| `npm run check:route-auth-boundary` | 0 | Boundary checks 15/15; scoped Vitest tests 61/61 |
| `npm run check:next-trust-boundary` | 0 | Boundary check passed; scoped Vitest tests 98/98 |
| `npm run typecheck` | 0 | TypeScript check passed on the serial rerun |
| Scoped `eslint` over changed TypeScript files | 0 | Clean |
| `npm run check:lib-boundary` | 0 | Boundary checks 3/3 |
| `git diff --check` | 0 | Clean |
| GitNexus `detect_changes(scope: all)` | 0 | Low risk; 5 indexed symbols, 7 changed files, 0 affected processes |

One parallel typecheck attempt returned 2 because the lib-boundary fixture test
removed a temporary directory while TypeScript was enumerating it. The required
serial rerun returned 0.

### Capability catalog

`apps/memroos/src/lib/auth/capabilities.ts` exports the `Capability` union,
`CAPABILITY` constants, and the exhaustive `CAPABILITIES` tuple with 30 verbs.
Each entry is justified by an existing route or authorization call site:

- Reviewer set: `agents:read` — `/api/agents/route.ts`, `/api/agents/[id]/route.ts`, and the reviewer proxy floor; `audit:read` — `/api/audit/route.ts`; `classification:review` — `/api/classification/reviews/route.ts` and its decision route; `escalations:read` — `/api/escalations/route.ts`; `memory:read` — `/api/memory-stats/route.ts` and `/api/memory-inventory/route.ts`.
- Operator additions: `agents:register` — `/api/onboarding/invite/route.ts` and `/api/agents/register/route.ts`; `keys:issue` — the `issueApiKey` registration path; `audit:export` — `/api/audit/export/route.ts`; `beliefs:review` — belief queue/resolve routes; `dispatch:run` — `/api/dispatch/route.ts`; `escalations:resolve` — `/api/escalations/[id]/resolve/route.ts`; `evals:run`, `seal:write`, and `l3:poll` — the operator route lists in `proxy.ts`; `library:update` — `/api/library/qmd-update/route.ts`; `memory:consolidate` — `/api/memory-consolidate/route.ts`; `memory:export` — `/api/memory/okf/export/route.ts`; `memory:write` — `/api/native-memory/ingest/route.ts`; `meetings:join` — `/api/meeting/join/route.ts`; `policy:write` — `/api/policy/knowledge/route.ts`; `skills:review` — `/api/skills/review/route.ts`.
- Admin additions: `agents:manage` — `canManageAgent` admin branch and agent ownership routes; `auth:capabilities` — `/api/auth/capabilities/route.ts`; `compliance:manage` — `/api/admin/compliance/route.ts`; `directives:manage` — directives budget/diff routes; `dsar:manage` — DSAR export/delete routes; `invites:manage` — `/api/auth/invite/route.ts` and its admin proxy rule; `users:manage` — `/api/users/route.ts` and `/api/users/[userId]/route.ts`; `vault:manage` — admin vault routes; `view-as:manage` — the admin view-as proxy rule.

`ROLE_CAPABILITIES` is a `Record<UserRole, ReadonlySet<Capability>>` with 5
reviewer capabilities, 21 operator capabilities (reviewer plus 16), and 30
admin capabilities (operator plus 9). `hasCapability` evaluates human
principals by `userId + role`; an explicitly tagged agent principal is a
fail-closed seam for later phases and has no database/schema behavior here.

### Equivalence proof

`requireRole` now checks that the required role's complete capability set is
held by a synthetic human principal. `ROLE_RANK` remains exported for the
compatibility consumers that are intentionally out of scope.

- 15 typed pairs were asserted: `[null, undefined, reviewer, operator, admin]`
  × `[reviewer, operator, admin]`.
- 10 additional null/undefined minimum-role compatibility pairs were asserted
  for untyped callers.
- All 25/25 derived-capability results agreed with the old rank comparison.
  The 403 body remains `{ error: "insufficient permissions" }` with status 403.

### Gate

The gate counts non-test TypeScript reference lines, matching the verified
baseline inventory. Baseline changed from 74 to 65: eight lines came from four
easy route migrations and one line came from removing the old rank comparison
inside the derived facade. The gate may only shrink from 65.

Migrated sites:

- `POST /api/policy/knowledge` → `CAPABILITY.POLICY_WRITE`
- `POST /api/memory-consolidate` → `CAPABILITY.MEMORY_CONSOLIDATE`
- `GET /api/classification/reviews` → `CAPABILITY.CLASSIFICATION_REVIEW`
- `GET /api/audit` → `CAPABILITY.AUDIT_READ`

### Checklist 1-8

1. Met — typed exhaustive capability catalog.
2. Met — `ROLE_CAPABILITIES` preserves reviewer ⊂ operator ⊂ admin.
3. Met — `hasCapability` has the human-session model and agent seam.
4. Met — `requireRole` is a capability-derived facade with unchanged signature/403 behavior.
5. Met — equivalence tests cover all requested role/minimum combinations.
6. Met — `requireCapability` is implemented, tested, and used by four routes.
7. Met — ratchet script, fixture tests, npm entry, and CI step are present.
8. Met — four easy call sites migrated; `proxy.ts` and all 210b-2/3/4 work were left untouched.

### Escalations

- None on authorization design: every current `(userRole, minRole)` case agreed.
- The preferred MiniMax lane was installed but not live-verified (DNS failure;
  1Password service-account authentication was also unavailable). A bounded
  fallback worker drafted the mechanical gate; the director reviewed and
  corrected its token-vs-reference-line counting before verification.
- MemroOS knowledge MCP search/write calls were cancelled by the runtime. This
  report is therefore persisted only at the requested local path, with no
  external fallback commit because the acceptance contract says work only in
  this tree and no commits.

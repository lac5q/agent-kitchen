# Phase 177 INSTALL-REPRO-06: npm audit --omit=dev triage

**Baseline captured:** 2026-07-21 (post-merge of 40923919 + install-repro-177)
**Lockfile SHA-1:** captured below per install of npm audit lockfile
**Total findings:** 12 (4 high, 6 moderate, 2 low, 0 critical)
**Reproduction:**

```bash
npm audit --omit=dev --json > /tmp/npm-audit-baseline.json
python3 -c "import json,sys; d=json.load(open('/tmp/npm-audit-baseline.json')); print(d['metadata']['vulnerabilities'])"
```

## Triage table

| # | Sev | Package(s) | GHSA | Status | Ticket | Resolution path |
|---|-----|------------|------|--------|--------|-----------------|
| 1 | high | brace-expansion | GHSA-jxxr-4gwj-5jf2 | triaged | INSTREP-06-001 | upgrade transitive via npm; depends on minimatch → glob in scripts |
| 2 | high | fast-uri | GHSA-4c8g-83qw-93j6 | triaged | INSTREP-06-002 | upgrade @modelcontextprotocol/sdk when patch lands |
| 3 | high | hono | GHSA-qp7p-654g-cw7p | triaged | INSTREP-06-003 | upgrade @hono/node-server; coord with apps/memroos/package.json bump |
| 4 | high | js-yaml | GHSA-h67p-54hq-rp68 | triaged | INSTREP-06-004 | upgrade eslint (consumes vulnerable js-yaml) |
| 5 | moderate | @hono/node-server | GHSA-frvp-7c67-39w9 | accepted (residual) | INSTREP-06-003 | rolled into hono bump above; track for SR |
| 6 | moderate | @modelcontextprotocol/sdk | (rolls up fast-uri) | accepted (residual) | INSTREP-06-002 | rolled into fast-uri upgrade |
| 7 | moderate | next → postcss | GHSA-qx2v-qp2m-jg93 | triaged | INSTREP-06-005 | upgrade postcss directly; Next 15.x line picks it up |
| 8 | moderate | postcss | GHSA-qx2v-qp2m-jg93 | triaged | INSTREP-06-005 | same as #7 |
| 9 | moderate | qs | GHSA-q8mj-m7cp-5q26 | triaged | INSTREP-06-006 | tracked for body-parser upgrade (peer) |
| 10 | moderate | shadcn → mcp | (rolls up fast-uri) | accepted (residual) | INSTREP-06-002 | same as #6 |
| 11 | low | @babel/core | GHSA-4x5r-pxfx-6jf8 | accepted (residual) | INSTREP-06-007 | used only in build; no runtime; track for next bump |
| 12 | low | body-parser | GHSA-v422-hmwv-36x6 | accepted (residual) | INSTREP-06-008 | used transitively by @modelcontextprotocol/sdk; rolls out with #2 |

## Acceptance criteria

INSTALL-REPRO-06 PASSES when:
1. All four high-severity findings have an active ticket with a concrete
   reproduction and a planned upgrade path (per row above).
2. No HIGH/CRITICAL finding is left without a ticket ID.
3. No blind `npm audit fix --force` is ever applied — each bumped package
   gets a focused regression (the package's own test, plus the relevant
   install-regression.sh --fast mode).
4. The accepted-residual findings are documented with a comment in the
   package.json (next bump cycles) or a tracking issue in the project's
   backlog.

## Re-triage cadence

After each accepted-residual PR closes, re-run `npm audit --omit=dev` and
update this table. The phases 177 acceptance gate freezes when:
- 0 untriaged HIGH or CRITICAL
- All MEDIUM/LOW findings either fixed or explicitly marked
  `accepted (residual)` with a follow-up date or version target.

# Phase 109: Parallel Domain Audit — Validation

**Phase:** 109-parallel-domain-audit
**Type:** Document-producing phase (attestation-based, not unit-test-based)
**Created:** 2026-06-07

---

## Validation Approach

Phase 109 produces four domain findings reports and one consolidated index. Correctness is verified by **file existence + coverage table presence**, not by running a test suite. An empty findings section is ambiguous ("checked, clean" vs "never checked") — each domain report MUST contain a Coverage Attestation table where every checklist item is explicitly tagged.

---

## Per-Wave Coverage Attestation

### Wave 1 — Plan 109-01 (Toolchain Bootstrap)

| Deliverable | Verification Command | Required Content |
|-------------|---------------------|-----------------|
| `.planning/audit/toolchain-baseline.md` | `grep -q "## Tool Versions" .planning/audit/toolchain-baseline.md` | One row per tool: semgrep, pip-audit, bandit, ruff, vulture, madge, knip, node, python3 |
| `.planning/audit/toolchain-baseline.md` | `grep -q "## Dependency CVE Baseline" .planning/audit/toolchain-baseline.md` | npm audit summary (counts + next advisory) + pip-audit results for all 4 Python service requirements files |

**Wave 1 gate:** Both sections present before Wave 2 agents run.

---

### Wave 2 — Plans 109-02, 109-03, 109-04, 109-05 (Parallel Domain Agents)

#### Domain A — Auth & Secrets (Plan 109-02)

| Deliverable | Verification Command | Required Content |
|-------------|---------------------|-----------------|
| `.planning/audit/domain-auth-secrets.md` | `test -f .planning/audit/domain-auth-secrets.md` | File exists |
| Coverage Attestation table | `grep -q "## Coverage Attestation" .planning/audit/domain-auth-secrets.md` | Table present |
| All 9 checklist items | Manual review of table body rows | JWT secret entropy, JWT algorithm, token TTLs, cookie flags, refresh-token revocation, authorizeRegistryWrite loopback, per-agent API keys, hardcoded-key scan, .env.example — each row tagged CLEAN / FINDING / N/A / NOT CHECKED (no blank rows) |
| Summary stats | `grep -q "## Summary Stats" .planning/audit/domain-auth-secrets.md` | critical/high/medium/low counts |

#### Domain B — API Surface (Plan 109-03)

| Deliverable | Verification Command | Required Content |
|-------------|---------------------|-----------------|
| `.planning/audit/domain-api-surface.md` | `test -f .planning/audit/domain-api-surface.md` | File exists |
| Coverage Attestation table | `grep -q "## Coverage Attestation" .planning/audit/domain-api-surface.md` | Table present |
| All 9 checklist items | Manual review of table body rows | Proxy matcher blind spots, bypass-list orphans, SQL injection, CSP unsafe-eval, rate limiting, CORS, Next.js CVEs, input validation, Iris/scanner ingress — each row tagged (no blank rows) |
| Summary stats | `grep -q "## Summary Stats" .planning/audit/domain-api-surface.md` | critical/high/medium/low counts |

#### Domain C — Data & Memory (Plan 109-04)

| Deliverable | Verification Command | Required Content |
|-------------|---------------------|-----------------|
| `.planning/audit/domain-data-memory.md` | `test -f .planning/audit/domain-data-memory.md` | File exists |
| Coverage Attestation table | `grep -q "## Coverage Attestation" .planning/audit/domain-data-memory.md` | Table present |
| Trust Boundaries table | `grep -q "## Trust Boundaries" .planning/audit/domain-data-memory.md` | Per-service boundary (loopback / docker-internal / public-reachable / unknown) with evidence |
| All 10 checklist items | Manual review of table body rows | knowledge-mcp bearer token, memory/orchestration service auth, voice-server token logging, unsafe YAML, data-leakage redaction, file-path traversal, SQLite path constants, ChromaDB/qdrant CVEs, mem0ai version lag, no-direct-Qdrant-write constraint — each row tagged (no blank rows) |
| Summary stats | `grep -q "## Summary Stats" .planning/audit/domain-data-memory.md` | critical/high/medium/low counts |

#### Domain D — Architecture & Code Quality (Plan 109-05)

| Deliverable | Verification Command | Required Content |
|-------------|---------------------|-----------------|
| `.planning/audit/domain-architecture.md` | `test -f .planning/audit/domain-architecture.md` | File exists |
| Coverage Attestation table | `grep -q "## Coverage Attestation" .planning/audit/domain-architecture.md` | Table present |
| All 8 checklist items | Manual review of table body rows | madge cycles, knip dead exports in security paths, as-any assessment, error-handling consistency, redundant patterns, cross-layer leakage, Python cross-service imports, execFile/spawn arg safety — each row tagged (no blank rows) |
| Summary stats | `grep -q "## Summary Stats" .planning/audit/domain-architecture.md` | critical/high/medium/low counts |

**Wave 2 gate:** All 4 domain reports present with complete Coverage Attestation tables (no blank rows) before Wave 3 runs.

---

### Wave 3 — Plan 109-06 (Findings Consolidation)

| Deliverable | Verification Command | Required Content |
|-------------|---------------------|-----------------|
| `.planning/audit/FINDINGS-INDEX.md` | `test -f .planning/audit/FINDINGS-INDEX.md` | File exists |
| Consolidated findings table | `grep -q "\| Finding ID \| Domain \|" .planning/audit/FINDINGS-INDEX.md` | Table with correct header |
| Severity ordering | Manual review | All `critical` rows before `high` before `medium` before `low` |
| Severity summary | `grep -q "## Severity Summary" .planning/audit/FINDINGS-INDEX.md` | Total + per-domain (A/B/C/D) counts |
| Routing summary | `grep -q "## Fix-Requirement Routing Summary" .planning/audit/FINDINGS-INDEX.md` | Count per SEC-01..06 and ARCH-01..05 bucket |
| Headline | `grep -q "## Headline" .planning/audit/FINDINGS-INDEX.md` | Top findings named by ID + Location |
| Completeness cross-check | `grep -q "## Coverage Cross-Check" .planning/audit/FINDINGS-INDEX.md` | Index row count == sum of per-domain finding counts |

**Wave 3 gate (phase gate):** FINDINGS-INDEX.md complete with all sections before `/gsd:verify-work` is run.

---

## Phase-Level Verification Script

Run after Wave 3 completes to confirm the full phase is done:

```bash
# Wave 1
grep -q "## Tool Versions" .planning/audit/toolchain-baseline.md && echo "PASS: toolchain versions" || echo "FAIL: toolchain versions"
grep -q "## Dependency CVE Baseline" .planning/audit/toolchain-baseline.md && echo "PASS: CVE baseline" || echo "FAIL: CVE baseline"

# Wave 2 — all four domain reports
for domain in domain-auth-secrets domain-api-surface domain-data-memory domain-architecture; do
  test -f ".planning/audit/${domain}.md" && echo "PASS: ${domain}.md exists" || echo "FAIL: ${domain}.md missing"
  grep -q "## Coverage Attestation" ".planning/audit/${domain}.md" && echo "PASS: ${domain} attestation" || echo "FAIL: ${domain} attestation missing"
  grep -q "## Summary Stats" ".planning/audit/${domain}.md" && echo "PASS: ${domain} summary stats" || echo "FAIL: ${domain} summary stats missing"
done

# Wave 3
test -f ".planning/audit/FINDINGS-INDEX.md" && echo "PASS: FINDINGS-INDEX.md exists" || echo "FAIL: FINDINGS-INDEX.md missing"
grep -q "## Severity Summary" .planning/audit/FINDINGS-INDEX.md && echo "PASS: severity summary" || echo "FAIL: severity summary missing"
grep -q "## Fix-Requirement Routing Summary" .planning/audit/FINDINGS-INDEX.md && echo "PASS: routing summary" || echo "FAIL: routing summary missing"
grep -q "## Coverage Cross-Check" .planning/audit/FINDINGS-INDEX.md && echo "PASS: cross-check" || echo "FAIL: cross-check missing"
```

All lines must print `PASS` before the phase is considered complete.

---

## Requirement → Deliverable Mapping

| Req ID | Satisfied By | Verification |
|--------|-------------|-------------|
| AUDIT-01 | `.planning/audit/domain-auth-secrets.md` with complete Coverage Attestation (9 items, no blank rows) | `grep -q "## Coverage Attestation" .planning/audit/domain-auth-secrets.md` |
| AUDIT-02 | `.planning/audit/domain-api-surface.md` with complete Coverage Attestation (9 items, no blank rows) | `grep -q "## Coverage Attestation" .planning/audit/domain-api-surface.md` |
| AUDIT-03 | `.planning/audit/domain-data-memory.md` with complete Coverage Attestation (10 items, no blank rows) | `grep -q "## Coverage Attestation" .planning/audit/domain-data-memory.md` |
| AUDIT-04 | `.planning/audit/domain-architecture.md` with complete Coverage Attestation (8 items, no blank rows) | `grep -q "## Coverage Attestation" .planning/audit/domain-architecture.md` |

# Audit Toolchain Baseline

Generated: 2026-06-07
Phase: 109 — Parallel Domain Audit (Plan 109-01)
Purpose: Tool version manifest + CVE baseline for Wave 2 domain agents (109-03, 109-04, 109-05)

---

## Tool Versions

| Tool | Version | Path | Status | Consumer |
|------|---------|------|--------|----------|
| semgrep | 1.132.0 | /opt/homebrew/bin/semgrep | AVAILABLE | Domain A, B SAST |
| pip-audit | 2.10.0 | /opt/homebrew/bin/pip-audit | AVAILABLE | Domain C Python CVE scan |
| bandit | 1.9.4 | /opt/homebrew/bin/bandit | AVAILABLE | Domain C Python SAST |
| ruff | 0.15.16 | /opt/homebrew/bin/ruff | AVAILABLE | Domain D Python linting |
| vulture | 2.16 | /opt/homebrew/bin/vulture | AVAILABLE | Domain D Python dead code |
| madge | 8.0.0 | /opt/homebrew/bin/madge | AVAILABLE | Domain D circular deps (TS) |
| knip | 6.16.1 | /opt/homebrew/bin/knip | AVAILABLE | Domain D dead exports (TS) |
| node | v26.0.0 | /opt/homebrew/bin/node | AVAILABLE | Domain D tooling |
| npm | 11.12.1 | /opt/homebrew/bin/npm | AVAILABLE | Domain D tooling |
| python3 | 3.14.2 | /opt/homebrew/bin/python3 | AVAILABLE | Domain C/D tooling |

**Install note:** All Python tools installed via `pip3 install pip-audit bandit ruff vulture --break-system-packages` (required for Homebrew Python 3.14). All Node tools installed via `npm install -g madge knip`. semgrep was pre-installed at /opt/homebrew (version 1.132.0 confirmed).

**Package legitimacy gate (Task 1):** checkpoint:human-verify blocking-human satisfied via orchestrator pre-approval in special_instructions. Package names verified against RESEARCH.md ## Package Legitimacy Audit table — all six packages confirmed as known-good tools (pip-audit: PyPA/Trail of Bits, bandit: PyCQA, ruff: Astral, vulture: long-standing Python dead-code tool, madge: long-standing TS/JS circular-dep tool, knip: modern TS dead-code tool). No typos or substitutions found.

---

## Dependency CVE Baseline

Captured: 2026-06-07
Purpose: Baseline CVE snapshot for Domain B (npm → SEC-04) and Domain C (pip → SEC-04) agents.

**Note:** This is a point-in-time snapshot. Re-run before Phase 110 execution.

---

### npm audit — apps/memroos

**Installed next.js version:** ^16.2.4

**Summary counts:**

| Severity | Count |
|----------|-------|
| critical | 0 |
| high | 1 |
| moderate | 3 |
| low | 0 |
| **Total** | **4** |

**Vulnerabilities by package:**

#### next (high — 13 advisories in range 16.0.0 - 16.2.5)

| GHSA | Title | Severity | Fix |
|------|-------|----------|-----|
| GHSA-8h8q-6873-q5fj | Next.js DoS with Server Components | high | upgrade |
| GHSA-26hh-7cqf-hhc6 | Middleware/Proxy bypass via segment-prefetch (incomplete fix follow-up) | high | upgrade |
| GHSA-3g8h-86w9-wvmq | Middleware/Proxy redirects cache-poisoning | high | upgrade |
| GHSA-ffhc-5mcf-pf4q | XSS in App Router using CSP nonces | high | upgrade |
| GHSA-vfv6-92ff-j949 | Cache poisoning via RSC cache-busting collisions | high | upgrade |
| GHSA-gx5p-jg67-6x7h | XSS in beforeInteractive scripts with untrusted input | high | upgrade |
| GHSA-mg66-mrh9-m8jx | DoS via connection exhaustion (Cache Components) | high | upgrade |
| GHSA-h64f-5h5j-jqjh | DoS in Image Optimization API | high | upgrade |
| GHSA-c4j6-fc7j-m34r | SSRF via WebSocket upgrades | high | upgrade |
| GHSA-492v-c6pp-mqqv | Middleware/Proxy bypass via dynamic route parameter injection | high | upgrade |
| GHSA-wfc6-r584-vfw7 | Cache poisoning in RSC responses | high | upgrade |
| GHSA-267c-6grr-h53f | Middleware/Proxy bypass via segment-prefetch routes | high | upgrade |
| GHSA-36qx-fr4f-26g5 | Middleware/Proxy bypass in Pages Router using i18n | high | upgrade |

**AUTH RISK FLAG:** Multiple middleware/proxy bypass CVEs (GHSA-26hh-7cqf-hhc6, GHSA-492v-c6pp-mqqv, GHSA-267c-6grr-h53f) are DIRECTLY RELEVANT to this app's threat model — auth enforcement is centralized in proxy.ts/Next.js middleware. Domain B agent (plan 109-03) MUST assess exploitability of these bypass CVEs against this app's specific matcher pattern.

#### brace-expansion (moderate — range 5.0.2 - 5.0.5)

| GHSA | Title | Severity |
|------|-------|----------|
| GHSA-jxxr-4gwj-5jf2 | Large numeric range defeats documented max DoS protection | moderate |

#### hono (moderate — range <=4.12.20)

| GHSA | Title | Severity |
|------|-------|----------|
| GHSA-qp7p-654g-cw7p | CSS Declaration Injection via Style Object Values in JSX SSR | moderate |
| GHSA-hm8q-7f3q-5f36 | Improper validation of NumericDate claims in JWT verify() | moderate |
| GHSA-p77w-8qqv-26rm | Cache Middleware cross-user cache leakage | moderate |
| GHSA-xrhx-7g5j-rcj5 | IP Restriction bypass for non-canonical IPv6 | moderate |
| GHSA-3hrh-pfw6-9m5x | Cookie sameSite/priority injection | moderate |
| GHSA-f577-qrjj-4474 | JWT middleware accepts any Authorization scheme (not only Bearer) | moderate |
| GHSA-2gcr-mfcq-wcc3 | app.mount() strips prefix using undecoded path causing incorrect routing | moderate |

**HONO NOTE:** Hono vulnerabilities include JWT accept-any-scheme (GHSA-f577-qrjj-4474) which may be relevant if Hono is used in any auth path. Domain A/B agents should check Hono usage context.

#### qs (moderate — range 6.11.1 - 6.15.1)

| GHSA | Title | Severity |
|------|-------|----------|
| GHSA-q8mj-m7cp-5q26 | qs.stringify crashes on null/undefined entries (DoS) | moderate |

**RESEARCH.md cross-check:** RESEARCH.md anticipated "1 high (next), 3 moderate" with count confirmed (1 high, 3 moderate packages). However, the actual advisories are more numerous (13 on next, 7 on hono, 1 on qs, 1 on brace-expansion) — npm audit counts by vulnerable package not by advisory count.

---

### pip-audit — Python Services

#### services/knowledge-mcp/requirements.txt

| Result | CVEs | Details |
|--------|------|---------|
| SCAN COMPLETE | 1 | diskcache 5.6.3: CVE-2025-69872 (no fix version listed) |

**CVE detail:**
- Package: diskcache 5.6.3
- CVE: CVE-2025-69872
- Fix versions: none listed
- Action: Domain C agent to assess exploitability and document findings

#### services/memory/requirements.txt

| Result | CVEs | Details |
|--------|------|---------|
| SCAN COMPLETE | 4 | mem0ai 0.1.118: 4 CVEs |

**CVE details:**
- Package: mem0ai 0.1.118
- CVE-2026-31240: no fix version
- CVE-2026-7597: fix version 2.0.0b2
- CVE-2026-31245: no fix version
- CVE-2026-31241: no fix version

**VERSION LAG NOTE:** mem0ai installed is 0.1.118 vs PyPI 2.0.2. Fix for CVE-2026-7597 requires 2.0.0b2 which is a major version upgrade. Domain C agent must assess these CVEs — they may be HIGH severity given mem0ai is a core memory service component.

#### services/orchestration/requirements.txt

| Result | CVEs | Details |
|--------|------|---------|
| SCAN COMPLETE | 0 | No known vulnerabilities |

Clean scan. Domain C agent should verify fastapi/uvicorn are pinned to current versions.

#### services/voice-server/requirements.txt

| Result | CVEs | Details |
|--------|------|---------|
| SCAN FAILED | N/A | pip-audit failed: pipecat-ai dependency resolution conflict |

**Error:** pip-audit virtual env creation failed due to conflicting pipecat-ai version constraints in requirements.txt (`pipecat-ai<2.0` conflicts with specific version pins). Domain C agent must resolve this conflict to obtain pip-audit coverage for voice-server. The requirements file exists but has an unresolvable dependency conflict that prevented scanning.

---

### Baseline Summary

| Service | Ecosystem | CVE Count | High | Auth-Relevant | Action Required |
|---------|-----------|-----------|------|---------------|-----------------|
| apps/memroos | npm | 4 packages (23 advisories) | 1 (next, 13 advisories) | YES — proxy bypass CVEs | Domain B: assess exploitability |
| services/knowledge-mcp | pip | 1 | 0 | No | Domain C: assess diskcache CVE-2025-69872 |
| services/memory | pip | 4 | unknown | YES — core memory service | Domain C: assess mem0ai CVEs urgently |
| services/orchestration | pip | 0 | 0 | No | Clean |
| services/voice-server | pip | SCAN FAILED | — | — | Domain C: fix requirements.txt conflict, re-scan |

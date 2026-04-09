---
phase: 1
slug: knowledge-foundations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + @testing-library/react |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run` + manual curl checks for KNOW-02 and KNOW-03
- **Before `/gsd-verify-work`:** Full suite must be green + all curl integration checks pass
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-xx-01 | 01 | 1 | KNOW-02 | — | N/A | Integration (API) | `curl -s http://localhost:3002/api/knowledge \| python3 -c "import json,sys; d=json.load(sys.stdin); c=[x for x in d['collections'] if x['name']=='knowledge']; assert len(c)==1 and c[0]['docCount']>0 and c[0]['lastUpdated'], 'FAIL'; print('PASS')"` | ❌ W0 | ⬜ pending |
| 1-xx-02 | 01 | 1 | KNOW-02 | — | N/A | Unit (component) | `npx vitest run src/test/collection-card.test.tsx` | ❌ W0 | ⬜ pending |
| 1-xx-03 | 01 | 1 | KNOW-03 | — | N/A | Integration (API) | `curl -s http://localhost:3002/api/knowledge \| python3 -c "import json,sys; d=json.load(sys.stdin); c=[x for x in d['collections'] if x['name']=='llm-wiki']; assert c[0]['docCount']>=6, 'FAIL'; print('PASS')"` | ❌ W0 | ⬜ pending |
| 1-xx-04 | 01 | 1 | KNOW-03 | — | N/A | Integration (CLI) | `qmd search "wiki" -c llm-wiki --files \| grep -q "wiki/" && echo PASS \|\| echo FAIL` | — (manual) | ⬜ pending |
| 1-xx-05 | 01 | 1 | KNOW-04 | — | N/A | Script content check | `grep -q "gitnexus-index" ~/github/knowledge/refresh-index.sh && echo PASS \|\| echo FAIL` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/test/collection-card.test.tsx` — unit test stub for KNOW-02 freshness rendering (CollectionCard renders `lastUpdated` date text)
- [ ] No framework install needed — vitest already configured at `vitest.config.ts`

*Existing infrastructure covers remaining requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| llm-wiki searchable via qmd CLI | KNOW-03 | qmd CLI not available in CI context | Run `qmd search "wiki" -c llm-wiki --files` and confirm results include files under `wiki/` subdir |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

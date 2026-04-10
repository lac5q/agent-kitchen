---
phase: 2
slug: knowledge-curator-agent
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Smoke tests (bash) + integration (curl to Qdrant API) |
| **Config file** | N/A — shell + Python scripts, not TypeScript |
| **Quick run command** | `bash -n ~/github/knowledge/knowledge-curator.sh` |
| **Full suite command** | `bash ~/github/knowledge/knowledge-curator.sh && curl -s -H "api-key: $QDRANT_API_KEY" "https://f969d77f-3cf6-4557-92cb-67f7cac0f44a.us-west-1-0.aws.cloud.qdrant.io:6333/collections/knowledge_docs" \| python3 -c "import json,sys; d=json.load(sys.stdin); print('points:', d['result']['points_count'])"` |
| **Estimated runtime** | ~5 minutes (first Qdrant index run with 462+ files) |

---

## Sampling Rate

- **After every task commit:** `bash -n ~/github/knowledge/knowledge-curator.sh` (syntax check)
- **After every wave:** Full smoke test — run orchestrator, verify outputs
- **Before `/gsd-verify-work`:** `knowledge_docs` Qdrant collection must have points > 0
- **Max feedback latency:** 30 seconds (syntax checks), ~5 min (full run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | KNOW-01-a | — | N/A | smoke | `bash -n ~/github/knowledge/knowledge-curator.sh && echo PASS` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | KNOW-01-b | — | N/A | integration | `curl -s -H "api-key: $QDRANT_API_KEY" "https://f969d77f-3cf6-4557-92cb-67f7cac0f44a.us-west-1-0.aws.cloud.qdrant.io:6333/collections/knowledge_docs" \| python3 -c "import json,sys; print(json.load(sys.stdin)['result']['points_count'])"` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | KNOW-01-c | — | N/A | smoke | `ls ~/github/knowledge/mem0-exports/*.md 2>/dev/null \| wc -l` | ❌ W0 | ⬜ pending |
| 2-01-04 | 01 | 1 | KNOW-01-d | — | N/A | smoke | `qmd search "knowledge" \| head -3 && echo PASS` | — (qmd installed) | ⬜ pending |
| 2-01-05 | 01 | 1 | KNOW-01-e | — | N/A | integration | `curl -s -H "api-key: $QDRANT_API_KEY" -H "Content-Type: application/json" -d '{"vector":[],"limit":1,"with_payload":true}' "https://f969d77f-3cf6-4557-92cb-67f7cac0f44a.us-west-1-0.aws.cloud.qdrant.io:6333/collections/knowledge_docs/points/search"` | ❌ W0 | ⬜ pending |
| 2-01-06 | 01 | 1 | KNOW-01-f | — | N/A | smoke | `crontab -l \| grep -q "knowledge-curator" && echo PASS` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `~/github/knowledge/knowledge-curator.sh` — main orchestrator script
- [ ] `~/github/knowledge/qdrant-indexer.py` — Gemini embed + Qdrant upsert
- [ ] `~/github/knowledge/mem0-export.sh` — mem0 REST API → markdown files
- [ ] `~/github/knowledge/llm-wiki-process.sh` — raw/ check + warning
- [ ] `~/github/knowledge/mem0-exports/` — directory for exported memory markdowns

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| llm-wiki raw/ files processed into wiki pages | KNOW-01 | Manual-only per GETTING-STARTED.md — ask Alba to process | Check `ls ~/github/knowledge/llm-wiki/raw/` before and after |
| Semantic search returns relevant results | KNOW-01-e | Requires judgement on relevance quality | Run `qmd query "agent memory architecture"` and compare with Qdrant semantic results |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency acceptable (syntax < 30s, full run ~5 min)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

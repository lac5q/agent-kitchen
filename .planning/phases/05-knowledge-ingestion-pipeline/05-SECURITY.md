---
phase: 05
slug: knowledge-ingestion-pipeline
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-10
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Script → mem0 REST | Local network call to localhost:3201 | Agent memories (meeting/email metadata) |
| Script → Qdrant Cloud | HTTPS with API key to remote vector DB | Markdown content embeddings |
| Script → Spark SQLite | Read-only filesystem access to local DB | Meeting transcript events |
| Script → gws CLI | OAuth-authenticated Google API calls | Gmail threads, Calendar events, Drive docs |
| Cron daemon → scripts | System scheduler invokes bash scripts | None (execution context only) |
| Live test → external APIs | Real Gmail/Calendar/Drive API calls | Same as gws CLI boundary |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01 | I — Info Disclosure | ingestion-state.json | accept | Contains only thread/event IDs and timestamps — no PII. Gitignored. | closed |
| T-05-02 | T — Tampering | ingestion-state.json atomic write | mitigate | `ingestion_utils.py:46-48` — temp file + `os.replace()` prevents corruption | closed |
| T-05-03 | I — Info Disclosure | .env in scripts | mitigate | `personal-ingestion-email.sh:9-11`, `personal-ingestion-transcripts.sh:10-12` — loaded with `set -a/set +a`, never echoed | closed |
| T-05-04 | S — Spoofing | mem0 REST localhost:3201 | accept | Localhost-only, no external exposure, single-user machine | closed |
| T-05-05 | I — Info Disclosure | Email body in markdown | accept | Files stored in local gitignored knowledge repo — same security as email client | closed |
| T-05-06 | T — Tampering | Email body HTML | mitigate | `ingestion_utils.py:108-109` — `re.sub(r"<[^>]+>", " ", raw_html)` + `html.unescape()` before any write | closed |
| T-05-07 | D — DoS | Gmail thread fetch | mitigate | `personal-ingestion-email.py:21,207-208,254` — `MAX_THREADS_PER_RUN=50` + `time.sleep(0.1)` | closed |
| T-05-08 | T — Tampering | Email filename path traversal | mitigate | `personal-ingestion-email.py:240` — filename uses alphanumeric `thread_id`, not subject | closed |
| T-05-09 | I — Info Disclosure | Meeting transcripts on disk | accept | Same security as local files; knowledge repo gitignored; user's own meetings | closed |
| T-05-10 | T — Tampering | Transcript content in markdown | accept | Read-only export from Google Drive; no execution context in .md files | closed |
| T-05-11 | D — DoS | Drive export unbounded | mitigate | `personal-ingestion-transcripts.py:311,458,358-362` — `pageSize=100`, `time.sleep(0.5)`, temp file deleted in `finally` | closed |
| T-05-12 | T — Tampering | Path traversal — Calendar/Drive project name | mitigate | `personal-ingestion-transcripts.py:184-217,391,403,428` — `_infer_project_name()` calls `slugify()` on all paths | closed |
| T-05-13 | I — Info Disclosure | mem0 memories with meeting content | accept | mem0 is local (localhost:3201), same trust as reading own calendar | closed |
| T-05-14 | T — Tampering | Spark SQLite writes | mitigate | `personal-ingestion-transcripts.py:482` — `sqlite3.connect(f"file:{SPARK_DB}?mode=ro", uri=True)` | closed |
| T-05-15 | I — Info Disclosure | Spark meeting data in markdown | accept | Same trust level as Spark app itself; local files, gitignored | closed |
| T-05-16 | D — DoS | Large PATHS in qdrant-indexer | accept | 3 additional small dirs (tens of files each); negligible runtime impact | closed |
| T-05-17a | T — Tampering | Spark project name path traversal | mitigate | `personal-ingestion-transcripts.py:546-548` — `slugify()` applied twice (defense-in-depth) | closed |
| T-05-17b | D — DoS | Cron every 6h frequency | accept | Email cap 50 threads/run; rate limited; non-fatal wrapper prevents cascade | closed |
| T-05-18 | R — Repudiation | No audit trail | mitigate | Scripts log to `/tmp/*.log`; `save_state()` writes `last_run` for all 4 channels | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-05-01 | ingestion-state.json contains only IDs/timestamps — no PII; gitignored | Luis Calderon | 2026-04-10 |
| AR-02 | T-05-04 | mem0 localhost-only; single-user machine; no network exposure | Luis Calderon | 2026-04-10 |
| AR-03 | T-05-05 | Email markdown has same security posture as email client; gitignored local repo | Luis Calderon | 2026-04-10 |
| AR-04 | T-05-09 | Meeting transcripts are user's own data; same as any local file | Luis Calderon | 2026-04-10 |
| AR-05 | T-05-10 | Drive exports are read-only; .md has no execution context | Luis Calderon | 2026-04-10 |
| AR-06 | T-05-13 | mem0 is localhost; same trust level as local calendar access | Luis Calderon | 2026-04-10 |
| AR-07 | T-05-15 | Spark data is user's own meeting data; gitignored | Luis Calderon | 2026-04-10 |
| AR-08 | T-05-16 | 3 small new dirs; qdrant-indexer runtime impact negligible | Luis Calderon | 2026-04-10 |
| AR-09 | T-05-17b | Email cron capped at 50 threads + rate limited; non-fatal wrapper prevents cascade | Luis Calderon | 2026-04-10 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-10 | 19 | 19 | 0 | gsd-security-auditor (claude-sonnet-4-6) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-10

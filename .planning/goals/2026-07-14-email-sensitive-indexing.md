# Goal: Permissioned Email + Meeting Sensitive Indexing

- Created: 2026-07-14T22:42:00Z
- Updated: 2026-07-14T23:14:00Z
- Version: 2026-07-14.3
- Status: local-only (`MEMROOS_APP_URL` unset); implementation complete for Phases 154–158 skeleton
- Lane: code + safety
- Orchestrator: Grok-4.5 (Cursor)
- Worker: MiniMax-M3 (smoke OK; director applied patches after worker hallucination on Slice A)
- Validator: GPT-5.6 Terra medium

## Goal statement

Index emails into MemRoOS with the same governed memory path as meetings: track by user, scan for PII, classify sensitivity, and keep confidential/legal/financial content owner-scoped (user + admins) while ordinary emails can become broader shared knowledge for agents and people.

## Product rule

- General emails → broader knowledge for agents and people (`internal` / `agent_visible` when safe).
- Sensitive emails (confidential, legal, financial, PII/credentials) → owning user + admins only.
- Meetings get the same sensitive categorization.
- Fixed provider/user confidential labels are primary; LLM is secondary proof only (tighten or abstain).

## Acceptance criteria

1. Every email/meeting artifact carries `owner_user_id` (and mailbox/meeting identity metadata).
2. `authorizeMemoryUse` allows owner-private recall for the owner and admins; denies other users/agents without delegation.
3. Confidential / legal / finance labels (and equivalent provider labels) flag content as restricted owner-scoped.
4. PII is detected before derived indexes; redacted projections are used for QMD/mem0/embeddings when sensitive.
5. Ordinary non-sensitive emails can promote to shared/agent-visible knowledge.
6. Cross-user leak negative fixtures pass.
7. Meeting frontmatter gains owner/sensitivity/PII fields parity with email contract.
8. Email ingest path exists as a private context lane (meet-sync twin), disabled by default until ACL proofs pass.

## GSD roadmap (v8.12)

| Phase | Slice | Status |
|-------|-------|--------|
| 154 | A — Owner ACL foundation | COMPLETE |
| 155 | B — Fixed confidential/legal/finance detectors | COMPLETE |
| 156 | C — Meeting frontmatter owner/sensitivity/PII parity | COMPLETE (defaults; provider populate follow-up) |
| 157 | D — Email ingest skeleton (disabled by default) | COMPLETE |
| 158 | E — LLM secondary adjudicator (shadow mode) | COMPLETE |

## Next action

Optional follow-ups: wire provider owner metadata into meet-sync transforms; enable email ingest only after live ACL proof; replace shadow-local adjudicator with constrained external LLM under feature flag.

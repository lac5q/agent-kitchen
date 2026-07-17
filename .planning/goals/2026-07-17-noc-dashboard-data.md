# Goal: Restore MemRoOS dashboard reporting data

- Created: 2026-07-17T00:17:00-07:00
- Updated: 2026-07-17T00:42:00-07:00
- Version: 2026-07-17.2
- Lane: ops + code
- Orchestrator/validator: Grok (Cursor)
- Worker: MiniMax-M3 (plan assist)

## Goal statement
MemRoOS dashboards must show accurate reporting: real multi-model token totals without RTK dependency, honest empty/unavailable when sources lack data, and no fabricated seed/mock zeros.

## Acceptance criteria
1. Ledger Tokens Processed + Model Mix use `/api/model-usage` (Claude JSONL ∪ efficiency `token_ledger`) across models; RTK is optional for savings/commands only.
2. `/api/tokens` returns 200 with `available:false` when RTK missing (no Ledger hard-error cascade).
3. Skills page can list repo-bundled skills when `~/.claude/skills` is empty (cloud/Heroku).
4. No production mock/seed data for memories, business-ops adapters, or APO.
5. Empty/unavailable states remain truthful when backends (mem0, Neo4j, QMD, RTK) are down or tables are empty.

## Dashboard audit (production 2026-07-17)
| Surface | Verdict |
|---------|---------|
| Ledger KPIs | BUG: RTK 503 blanked all cards → fixed in working tree |
| NOC pulse | Honest empty/live from SQLite; savings intentionally unbound |
| Memory | Accurate: vector/graph/knowledge unavailable (services down); messages 0 |
| Skills | Accurate empty on Heroku (`~/.claude/skills` missing) → fixed to scan repo skills |
| Business Ops / evals | Accurate empty (no L3 events / no eval runs) — not fake adapters |
| Improvements/APO | Accurate zeros (no proposals) |
| Audit | Real system retention/decay rows (calendar year is 2026) |

## Next
Commit + deploy to Heroku so production gets Ledger/skills fixes.

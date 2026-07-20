# Human Wiki Surface (v8.14)

- **Document version:** 2026-07-18.1
- **Creation date/time (UTC):** 2026-07-18T07:04:32Z
- **Update date/time (UTC):** 2026-07-18T07:04:32Z
- **Sources:** `.planning/ROADMAP.md` § v8.14, WIKISURF-01..08, code under `apps/memroos/src/lib/wiki-*.ts`

## What shipped

1. **Digest job** (`wiki-digest`) — clusters recent memories into `llm-wiki/wiki/memroos-digest/`, updates `index.md` / `log.md`, refreshes `graph/knowledge-graph.json`, watermark at `llm-wiki/.memroos/wiki-digest-watermark.json`.
2. **Reader** — authenticated `/wiki` UI with folder tree, markdown render, `[[wikilinks]]`, search, and light graph list.
3. **Ops** — cron-health default job, in-app scheduler (6h), API `POST/GET /api/wiki/digest`, scripts `npm run wiki:digest` / `wiki:digest:cron`.

## Commands

```bash
KNOWLEDGE_BASE_PATH=/path/to/knowledge npm run wiki:digest -- --dry-run
npm run wiki:digest
curl -s -X POST http://localhost:3000/api/wiki/digest -H 'content-type: application/json' -d '{"dryRun":true}'
```

## Notes

- Voyage / Phase 166 is out of scope for the parent quality-gate goal.
- Vault missing in cloud is expected; UI shows an empty state.
- Redaction skips secret-like and high-sensitivity personal/legal scraps.

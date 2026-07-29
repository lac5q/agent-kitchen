# Indexing connected tools into MemRoOS memory

*Design note. Audited against the live codebase and the live Linear MCP
connection on 2026-07-27. No implementation yet — the scope-identity decision
in §4 is the operator's to make.*

## The problem

Connecting a provider in Settings → Integrations stores a credential and
nothing else. `tool-auth` is pure brokerage: `nango-client.ts` lists/creates/
deletes Nango connections, `credential-store.ts` persists the connection id.
No code path walks a connected provider and writes its content anywhere.

MCP is pull-on-demand by design — an agent calls `list_issues` when it needs
issues. So "Connected ✅" today means *an agent can query Linear when asked*,
not *your Linear backlog is searchable in MemRoOS*. Making the second true is
a build, not a config change.

## 1. What already exists (the good news)

Three pieces are in place and do not need to be written:

| Piece | Where | What it does |
|---|---|---|
| Embedding cycle | `lib/embeddings/embedding-job.ts` | every 300s, embeds up to 50 rows via Ollama `nomic-embed-text` |
| FTS5 index | `db-schema.ts` `messages_fts` | external-content full-text over `messages` |
| Policy-gated MCP client | `lib/msiq/msiq-adapter.ts` | scope identity, injection detection, idempotent writes |

## 2. The load-bearing constraint

`runEmbeddingCycle` is hard-keyed to one table:

```ts
const ids = messagesNeedingEmbedding(db, EMBEDDING_CYCLE_LIMIT);
const selectMessage = db.prepare("SELECT id, content FROM messages WHERE id = ?");
upsertEmbedding(db, row.id, result.embedding, EMBEDDING_MODEL);
```

`messages_fts` is likewise `content=messages, content_rowid=id`.

**Everything downstream — embeddings, FTS, recall — flows from `messages`.**
That single fact decides the design. Either connector content lands in
`messages` and the whole pipeline comes free, or it lands elsewhere and the
embedding job, the FTS external-content table, and every recall path must be
extended or forked.

### Recommendation: land it in `messages`

`messages` has `UNIQUE(session_id, request_id)`, which gives idempotent
re-sync for free:

- `session_id` → `linear:<connection_id>` (stable per connection)
- `request_id` → the provider's own object id (`ENG-95`)
- `agent_id` / `project` → provider + workspace
- `role` → `"connector"` (new value; existing rows use user/assistant)

Re-running a sync over an unchanged issue hits the unique constraint and
no-ops. No separate dedupe table.

### The trap: default labels make new rows invisible

`addSecurityLabelColumns` defaults every row to:

```sql
visibility TEXT NOT NULL DEFAULT 'private'
policy     TEXT NOT NULL DEFAULT 'sealed'
```

And the FTS trigger only fires on:

```sql
WHEN new.policy = 'indexable'
 AND new.visibility IN ('internal','public_safe','public_approved')
```

**A connector row inserted with defaults is silently absent from search.** It
would embed (the embedding job has no label filter) but never appear in FTS
recall — a half-indexed state that looks like it worked. Connector inserts
must set `policy='indexable'` and an appropriate `visibility` explicitly, and
that choice must be deliberate: it is the difference between a private Linear
workspace being searchable and being sealed.

## 3. Per-provider sync manifests (not a generic walker)

Linear MCP exposes **57 tools**. Only a handful are list-shaped reads worth
polling. A generic "walk everything" crawler would call mutations. Each
provider needs an explicit manifest of which tools to poll.

Verified against the live connection:

| Tool | Incremental filter | Pagination |
|---|---|---|
| `list_issues` | `updatedAt`, `createdAt` ✅ | `cursor` + `hasNextPage` |
| `list_documents` | `updatedAt`, `createdAt` ✅ | `cursor` |
| `list_comments` | ❌ none | `cursor` |
| `list_projects`, `list_cycles`, `list_teams`, `list_users` | — | small, full-pull fine |

`list_issues` accepting `updatedAt` is the finding that makes this cheap:
**incremental sync is possible without content hashing.** Store a per-tool
high-water mark, pass `updatedAt > last_sync`, and each cycle pulls only what
changed.

`list_comments` has no time filter and is keyed by parent (`issueId`), so
comments should be fetched per-changed-issue rather than swept globally.

### Volume (measured, not estimated)

A `limit:100` call returned 100 issues with `hasNextPage: true`. Sample
payload ran ~4.5KB for 3 issues (~1.5KB/issue), and `list_issues` truncates
long descriptions with *"use `get_issue` for full description"*.

So: **truncated bodies by default**, with `get_issue` as an opt-in second pass
for issues that matter. Embedding a truncated description is cheap; embedding
every full description plus every comment is a different cost profile. Start
truncated.

## 4. OPEN DECISION — scope identity (operator's call)

`msiq-adapter.ts` fails closed. It demands complete scope identity —
tenant / user / agent / space / label / purpose / belief-stage — and denies on
mismatch. A Linear issue has **no natural actor**: nobody in MemRoOS "said" it.

`messages.space_id` (nullable, `REFERENCES spaces(id)`) is the seam. Options:

- **(a) One space per connection.** Linear content lives in its own space,
  membership controls who can recall it. Cleanest isolation; needs a space
  created per connection.
- **(b) Attribute to the connecting user.** Simplest, but conflates "Luis
  connected this" with "Luis wrote this," and every Linear issue in the
  workspace becomes Luis's memory.
- **(c) A synthetic `connector` actor per provider.** Honest about provenance;
  requires deciding what that actor may access.

This is a security-boundary decision, not a mechanical one. It determines who
can recall a Linear issue through MemRoOS — and Linear content includes
private team discussion.

## 5. Proposed shape

Once §4 is decided:

1. `lib/connectors/manifest.ts` — per-provider tool list, incremental key,
   pagination style. Linear first; Notion and Circleback follow the same shape.
2. `lib/connectors/sync-job.ts` — mirrors `embedding-job.ts`: interval timer,
   bounded per-cycle limit, degraded-return on provider failure. Reads the
   Nango-brokered token, calls MCP through `msiq-adapter` (not raw fetch — the
   injection detector matters here; issue descriptions are untrusted input).
3. Insert into `messages` with explicit labels + `space_id`, per §2/§4.
4. High-water marks in a small `connector_sync_state` table.
5. Existing embedding cycle picks the rows up with **no changes**.

The deliberate non-goal: no new vector store, no new recall path, no forked
FTS. If the rows land in `messages` correctly labelled, everything downstream
already works.

## 6. Risks

- **Untrusted content.** Linear issue bodies are attacker-influenced in the
  general case. They must go through `injection-detector.ts` before landing in
  memory an agent will later read as context.
- **Silent half-indexing.** Per §2: wrong labels → embedded but unsearchable.
  Any implementation needs a test asserting a connector row appears in
  `messages_fts`.
- **Cost.** Every synced row hits Ollama on oracle-1. A full Linear backfill is
  a one-time burst; the 50-row/300s cycle limit means it drains slowly rather
  than spiking.
- **`list_comments` has no incremental filter** — the one place a naive
  implementation will do full re-pulls forever.

# Linear GraphQL SDL — provenance

**Source:** https://developers.linear.app/docs/graphql/working-with-the-graphql-api
            + https://linear.app/developers/graphql
**Captured:** 2026-07-21
**Provenance tag:** `doc-derived` (per CONNMEM-01 contract test fixture tag).

Linear's authoritative GraphQL schema lives behind the introspection endpoint
at https://api.linear.app/graphql (auth-required). The schema fields summarised
below come from public documentation, NOT a live introspection dump; consumers
that need the live schema should run an introspect request against the
production endpoint and replace this file with the SDL output. Until that
happens, this file is labelled `doc-derived` and contract tests that depend
on a specific shape must parameterise the tolerance for drift.

## Public-API surface (per Linear docs)

### Object families exposed

- `Organization` — top-level workspace container (Linear uses multi-org auth
  for company-wide indexing; one identity per organization)
- `Team` — public teams and explicitly-authorized private teams
- `User` — assignees/creators/members
- `Issue` — issues + sub-issues; archived/completed/cancelled included via
  `includeArchived: true` (default off)
- `Comment` — comments + reactions
- `Project` — projects, milestones, project updates
- `Initiative` — initiatives and initiative updates (requires the
  workspace plan to enable; capability-discover before claiming)
- `Document` — markdown documents; preserve relationships, updates, deletes
- `Cycle` — cycles and statuses; archived included where exposed
- `Label` — labels and label colors
- `Customer` / `CustomerRequest` — requires the corresponding feature flag
- `Attachment` — metadata + body exposed by API; binary fetch under separate policy
- `Relation` — issue-to-issue dependencies (both directions)

### Auth

- `Authorization: <personal_api_key_or_oauth_bearer>`
- Personal API keys are accepted for read-only spikes; OAuth (preferred) is
  required for company-managed identities whose visibility spans every
  intended workspace.

### Pagination

- All list queries are cursor-paginated; default 50 results when no
  `first`/`after` arguments are passed. Backfill must paginate fully,
  bounding each batch under Linear's request/endpoint/query-complexity
  limits and using adaptive backoff.

### Webhooks

- Webhooks live on an Organization and can scope to all public teams or a
  single team. Only workspace admins or OAuth apps with the documented
  administrative scope can create/read webhooks.
- Documented object families: issues, issue attachments, issue comments,
  issue labels, comment reactions, projects, project updates, documents,
  initiatives, initiative updates, customers, customer requests.
- Webhook deliveries carry create/update/remove semantics with HMAC-SHA256
  signatures over the raw body and a timestamp to check (replay protection).
- Partial success: GraphQL can return HTTP 200 with an `errors` array; a
  sync must not count that as complete success.

### Archived/deleted semantics

- Archived resources are excluded by default and require `includeArchived: true`.
- Removed objects are reported as null fields in paginated responses and
  return deleted records via `auditLog`-adjacent queries where exposed.

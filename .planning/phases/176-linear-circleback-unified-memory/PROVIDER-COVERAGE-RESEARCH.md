# Linear + Circleback Company-Wide Coverage Research

**Date:** 2026-07-21
**Purpose:** Determine whether MemRoOS can index the entire authorized company information held in Linear and Circleback, and define evidence required before making that claim.

## Executive conclusion

### Linear: company-wide coverage is technically plausible, but identity and visibility determine completeness

Linear exposes the same introspectable GraphQL API used by its own applications, supports OAuth2 and personal API keys, Relay-style cursor pagination, archived-resource inclusion, filtering, rate-limit headers, and organization/team webhooks. Its documented webhook object families include issues, attachments, comments, labels, reactions, projects, project updates, documents, initiatives and initiative updates, customers, customer requests, and convenience events such as issue SLA. That is a strong foundation for a full authorized-workspace mirror.

However, “the entire company” cannot be inferred from a successful API call. MemRoOS must authenticate with a company-managed identity/application whose access encompasses every intended workspace and every intended team/resource. Private teams or resources outside that identity’s visibility will not become visible merely because a webhook uses `allPublicTeams: true`. Archived resources are hidden by default and must be requested explicitly. Multiple Linear organizations/workspaces require separate authorization and inventory reconciliation.

### Circleback: complete meeting coverage is plausible for what the authenticated identity can list, but company-wide memory coverage is not yet proven

The repository’s existing connector and preflight contract assume an authenticated Circleback CLI with `meetings:read` and `transcripts:read`, and support paginated meeting search plus batch reads for meeting details and transcripts. Circleback’s public product surfaces substantiate meeting capture, transcripts, notes, assigned action items, searchable conversation history, and desktop/in-person capture.

Publicly discoverable Circleback material did not establish a stable, documented organization-wide API, admin/service identity, distinct “memories” endpoint, webhook model, deletion feed, or guarantee that one identity can list every teammate’s meeting. Therefore MemRoOS must not claim “all company Circleback information” until capability discovery and provider/account validation prove tenant-wide visibility and enumerate every supported object family. If Circleback only exposes meetings shared with one user, true company-wide coverage requires an admin/team integration, provider-supported export, one authorized connector per user, or a commercial arrangement with Circleback.

## Evidence from Linear documentation

- The public API is GraphQL and is described as the same API Linear uses internally; schema introspection is supported.
- Authentication supports OAuth2 and personal API keys; OAuth is recommended for applications.
- All list queries are cursor-paginated; the default is 50 results if pagination arguments are omitted.
- Archived resources are excluded by default and require `includeArchived: true`.
- Linear recommends webhooks rather than polling for near-real-time updates, while pagination/filtering supports reconciliation.
- Webhooks belong to an organization and can cover all public teams or one team.
- Only workspace admins or OAuth applications with the documented administrative scope can create/read webhooks.
- Documented webhook families include issues, issue attachments, issue comments, issue labels, comment reactions, projects, project updates, documents, initiatives, initiative updates, customers, and customer requests.
- Webhook deliveries include create/update/remove semantics, retry on failure, HMAC-SHA256 signatures over the raw request body, and a timestamp that should be checked to prevent replay.
- GraphQL can return partial data with HTTP 200 plus an `errors` array; a sync must not count that as complete success.
- Uploaded images/assets require authentication. Copying binary content into MemRoOS therefore needs a separate storage/retention decision.
- API requests have request, endpoint, and query-complexity limits; a full mirror needs bounded pagination, adaptive backoff, and reconciliation checkpoints.

## Company-wide Linear coverage matrix

| Data family | Evidence/route | Required completeness check |
|---|---|---|
| Organizations/workspaces | OAuth/API identity + GraphQL viewer/organization queries | Enumerate every intended organization and compare against approved inventory |
| Teams and members | GraphQL schema | Include public and authorized private teams; compare team IDs/counts |
| Issues/sub-issues | GraphQL + issue webhooks | Include archived and completed/canceled records; reconcile counts per team |
| Comments/reactions | GraphQL + comment/reaction webhooks | Paginate nested connections independently; preserve chronology and deletes |
| Projects/milestones/updates | GraphQL + project/project-update webhooks | Reconcile active, completed, canceled and archived projects |
| Initiatives/updates | GraphQL + initiative webhooks | Confirm feature availability for the workspace plan and authorization |
| Documents | GraphQL + document webhooks | Preserve Markdown, relationships, visibility, updates and deletion |
| Cycles/statuses/labels | GraphQL; selected webhook support | Full reference-data inventory plus archived values |
| Relations/dependencies | GraphQL issue relations | Preserve both directions and deleted relation tombstones |
| Customers/customer requests | GraphQL + documented webhooks | Confirm feature is enabled and identity is entitled to access it |
| Attachments/links | GraphQL + attachment webhooks | Index metadata/body exposed by API; binary fetch only under approved policy |
| Users/assignees/creators | GraphQL | Store minimum necessary profile fields; retain inactive/deleted references safely |
| History/activity/SLAs | Schema-dependent queries and convenience webhooks | Capability-discover and explicitly report unsupported/non-exportable history |

## Company-wide Circleback coverage matrix

| Data family | Current evidence | Completeness status |
|---|---|---|
| Meeting inventory | Existing CLI contract: paginated `meetings search` | Plausible for meetings visible to authenticated identity; tenant-wide visibility unproven |
| Meeting details | Existing `meetings read` batching | Supported by current connector contract |
| Transcripts/speakers | Existing `transcripts read` batching | Supported when transcript scope/content is available |
| Notes/summaries | Fields consumed by existing transformer; public product claims meeting notes | Supported per returned meeting, not yet reconciled tenant-wide |
| Action items/assignees | Existing transformer + public product claims assigned action items | Supported per returned meeting; separate lifecycle/update semantics need proof |
| Attendees/recording/share URL | Existing transformer fields | Supported when returned and authorized |
| Searchable conversation history | Public product positioning | Product capability, but bulk/admin API semantics unproven |
| Screen-share/OCR-derived context | Public product statement | Must capability-discover whether export is included in notes or a separate object |
| Separate “memories”/insights | No public stable endpoint established in this research | **Unproven**; cannot claim coverage until CLI/API discovery proves it |
| Team/admin-wide inventory | No public stable admin API established in this research | **Unproven**; may require provider support or per-user authorization |
| Webhooks/deletion feed | Not established | Use polling/reconciliation; deletion completeness remains a release blocker |

## Required proof before saying “entire company”

1. **Approved source inventory:** list every Linear organization/workspace and Circleback team/account/user source intended to comprise the company boundary.
2. **Identity proof:** record authenticated provider identity, organization IDs, scopes, role/admin status, and accessible team/source IDs without recording secrets.
3. **Capability manifest:** introspect Linear’s current schema and discover the installed Circleback CLI/API commands; freeze supported object families and fields for the run.
4. **Full backfill receipts:** per object family record provider count, paginated fetched count, unique normalized count, filtered count with reasons, failed count, deleted/tombstoned count, and indexed count.
5. **Zero silent gaps:** any inaccessible workspace/private team/user meeting set must be visible as `authorization_blocked` or `provider_capability_absent`, not rolled into a green total.
6. **Archived/deleted coverage:** explicitly include Linear archived data and prove remove/delete propagation. Circleback must have a reconciliation strategy that detects records no longer returned.
7. **Incremental proof:** verify signed Linear webhook handling plus scheduled reconciliation; verify Circleback cursor/polling from the last durable checkpoint.
8. **Recall proof:** sample every object family and source identity through source→canonical record→index→recall, with current source links.
9. **Permission proof:** test that MemRoOS does not grant users access to private source records they could not access in the provider.
10. **Revocation/purge proof:** disconnect a test source and demonstrate stopped ingestion plus policy-compliant deletion from raw receipts, source docs, QMD, graph and mem0 projections.

## Recommended implementation decision

- Use a company-managed Linear OAuth app with the minimum required read/admin-webhook scopes, authorized separately for every company workspace. A personal key is acceptable only for an initial read-only spike, not the durable company connector.
- Configure organization-wide webhook coverage, then enumerate authorized private teams explicitly. Do not assume `allPublicTeams` covers private teams.
- Run nightly full reconciliation with `includeArchived: true` even when webhooks are healthy.
- Treat Circleback as a gated connector: first run `circleback --help`, auth/scope inspection, meeting inventory totals, and any team/admin/export commands on the actual operator host. Engage Circleback support if one identity cannot enumerate all company meetings or if distinct memories/insights are not exportable.
- If Circleback has no team-wide identity, support multiple per-user authorizations with deduplication by stable meeting ID, but only with employee consent and an approved retention/access policy.

## Official/source URLs

- Linear GraphQL API: https://linear.app/developers/graphql
- Linear OAuth2: https://linear.app/developers/oauth-2-0-authentication
- Linear actor authorization: https://linear.app/developers/oauth-actor-authorization
- Linear webhooks: https://linear.app/developers/webhooks
- Linear pagination: https://linear.app/developers/pagination
- Linear filtering: https://linear.app/developers/filtering
- Linear rate limits: https://linear.app/developers/rate-limiting
- Linear attachments: https://linear.app/developers/attachments
- Linear customers: https://linear.app/developers/managing-customers
- Linear public schema explorer: https://studio.apollographql.com/public/Linear-API/schema/reference?variant=current
- Circleback product: https://circleback.ai/
- Circleback desktop capture: https://circleback.ai/desktop

## Research limitation

Circleback’s public site did not expose sufficiently detailed developer/admin documentation through public search to verify tenant-wide API semantics. The repo’s CLI contract is useful implementation evidence but not proof that the authenticated identity sees every employee’s meetings. This uncertainty is now an explicit Phase 176 gate rather than an assumption.

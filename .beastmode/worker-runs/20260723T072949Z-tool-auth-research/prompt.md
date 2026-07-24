You are the bounded research worker for a director-led Beastmode run on memroos.

CRITICAL CONSTRAINT: You are being called via a plain chat completions API. You DO NOT have access to any tools (no bash, no file read, no file write, no web search). You must NOT attempt to call tools. You must NOT emit `<tool_call>` blocks or any similar pseudo-tool syntax. You can only OUTPUT TEXT.

Your sole deliverable is a single Markdown document written to stdout. There is no execution environment — you only get one chance to produce the output.

TASK: Produce a research report on how memroos can introduce a general-purpose third-party tool authentication UX. Today memroos has user/login auth (HS256 JWT, /api/auth/*, MEMROOS_OPERATOR_API_KEY) but every external tool integration (Slack, Linear, Circleback, GitHub, Notion, HubSpot, QuickBooks, Google Drive, etc.) re-implements its own OAuth flow. Phase 176 hacks this for Linear/Circleback; Phase 178 does it for Paperclip. We need a generic tool-auth plane.

CONTEXT YOU MUST RELY ON (treat as ground truth — do not fabricate repo paths or file contents beyond what is summarized below):

MEMROOS AUTH SURFACE (already exists):
- User login: /api/auth/{login,register,logout,refresh,password-reset,invite}, HS256 JWT with MEMROOS_JWT_SECRET
- Operator API key: MEMROOS_OPERATOR_API_KEY for registry writes
- Per-agent bearer keys: ak_<agentId>_<32bytes-base64url>, SHA-256 hashed in agent_api_keys table
- Vault: AES-256-GCM envelope encryption, MEMROOS_VAULT_KEY_PATH -> ~/.memroos/vault.key (0600)
- Secrets stored in .env.local (gitignored) or Heroku config vars; .env.example has only placeholders
- FLEET-22 (v8.5) already documented this secrets model in docs/secrets-and-durability.md
- v8.5 Agent Fleet Plane ships MCP-tool gateway and per-agent runtime contracts

MEMROOS INSTALL PROFILE (already exists):
- Local-first: install.sh --local, docker-compose.local.yml
- Single-binary / single-container topology; SQLite + Qdrant Cloud + Neo4j Aura as defaults
- Single-tenant per installation (one operator per memroos deployment)
- MCP server topology: memroos exposes tools via MCP; agents consume

CANDIDATES YOU MUST COVER (do not skip any):
1. Composio — github.com/ComposioHQ/composio — current license (recently shifted), SaaS+OSS, MCP integration story
2. Arcade.dev — github.com/Arcade-Labs/arcade — current positioning, OSS, MCP story
3. Nango — github.com/NangoHQ/nango — OSS product-integration platform, OAuth refresh, multi-tenant
4. Pipedream — github.com/pipedreamhq/pipedream — workflow platform with OAuth integrations
5. n8n — github.com/n8n-io/n8n — OSS workflow with 400+ integrations
6. ToolJet — github.com/ToolJet/ToolJet — OSS low-code internal tools with integrations
7. Activepieces — github.com/activepieces/activepieces — OSS Zapier alternative
8. Huginn — github.com/huginn/huginn — OSS agent/automation, Ruby
9. NextAuth/Auth.js — github.com/nextauthjs/next-auth — OAuth library for Next.js (roll-your-own)
10. Ory Hydra + Ory Kratos — github.com/ory/hydra, github.com/ory/kratos — OAuth server + identity
11. Keycloak — github.com/keycloak/keycloak — OSS IdP (heavyweight)
12. SuperTokens — github.com/supertokens/supertokens-core — OSS auth
13. Logto — github.com/logto-io/logto — OSS auth platform
14. WorkOS — workos.com — enterprise SSO/identity SaaS
15. Clerk — github.com/clerk/clerk-sdk-node — user auth SaaS
16. Auth0 — github.com/auth0/node-oauth2-jwt-bearer — user auth SaaS
17. BoxyHQ — github.com/boxyhq/saas-starter-kit — SSO/SAML

For each candidate, report: license (be honest if uncertain), repo URL, primary use case, OAuth-refresh support, multi-tenant story, MCP/A2A compatibility, what memroos would have to wire, last-known activity (training-data cutoff 2026-01).

DELIVERABLE STRUCTURE (write this as your entire output):

## Summary
3-5 bullets.

## Candidate Survey
A Markdown table with columns: Project | License | Repo | Primary Use Case | OAuth Refresh | Multi-Tenant | MCP/A2A Compatible | Memroos Fit Note | Last Known Activity

One row per candidate (17 rows). Mark uncertain cells with "uncertain" rather than fabricating.

## Recommendation
Name ONE primary recommendation (or rank top 2). Justify against the others. State assumptions the recommendation depends on (e.g. "assumes memroos stays self-hosted", "assumes OAuth-only is sufficient — API keys + service accounts are deferred").

## Draft Roadmap Phase Block
Write a ready-to-paste block in this EXACT format (the user will paste it into .planning/ROADMAP.md):

```
## v8.XX <Version Name>

### Phase NNN — <Phase Title>

**Goal:** <one sentence>
**Depends on:** <phases or "none">
**Requirements:** REQID-01, REQID-02, REQID-03, REQID-04, REQID-05
**Success criteria:**
1. <verifiable>
2. <verifiable>
3. <verifiable>
4. <verifiable>
5. <verifiable>
**Source opinion:** <one-line pointer to the spike>
**Out of scope (v8.XX):**
- <bullet>
- <bullet>

### Progress Table (v8.XX <Name>)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| NNN. <Phase Title> | 0/? | Planned | — |
```

Pick a sensible version number above v8.22 (the most recent in the roadmap). Pick 4-6 success criteria.

## Open Questions
3-5 questions for the user (UX flow choice, OAuth vs API-key hybrid, multi-tenant boundaries, MCP-tool shape).

## Sources
Every URL you rely on, marked "as of model knowledge cutoff 2026-01". Be honest about uncertainty.

RULES:
- Do not fabricate. If you're not sure of a license, write "uncertain" and explain.
- Do not call tools. Do not emit `<tool_call>` or any tool syntax.
- Output ONLY the Markdown report. Nothing else.
- Be concrete. The user will use this to make a decision today.
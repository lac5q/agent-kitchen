# Open Brain Recipe Catalog

This is the target catalog for closing the gap between our private operational knowledge base and the broader Open Brain / OB1-style ecosystem.

Status key:

- **Mapped** — represented in our knowledge-system architecture or docs.
- **Adapter needed** — needs an importer, connector, or workflow implementation.
- **Skill pack** — should live as reusable prompt/process files agents can load.
- **Primitive** — foundational pattern other recipes should depend on.

## `/recipes` — Import Your Data

| Recipe | What it does | Contributor | Status |
|---|---|---:|---|
| ChatGPT Import | Parse ChatGPT data exports, filter trivial conversations, summarize via LLM | @matthallett1 | Adapter needed |
| Perplexity Import | Import Perplexity AI search history and memory entries | @demarant | Adapter needed |
| Obsidian Vault Import | Parse and import Obsidian vault notes with full metadata | @snapsynapse | Adapter needed; high priority for SketchPop/Jobhunt/Knowledge vaults |
| X/Twitter Import | Import tweets, DMs, and Grok chats from X data exports | @alanshurafa | Adapter needed |
| Instagram Import | Import DMs, comments, and captions from Instagram exports | @alanshurafa | Adapter needed |
| Google Activity Import | Import Google Search, Gmail, Maps, YouTube, Chrome history from Takeout | @alanshurafa | Adapter needed; must be private/redacted by default |
| Grok (xAI) Import | Import Grok conversation exports with MongoDB-style date handling | @alanshurafa | Adapter needed |
| Journals/Blogger Import | Import Atom XML blog archives from Blogger/Journals | @alanshurafa | Adapter needed |
| Email History Import | Pull Gmail archive into searchable thoughts | @matthallett1 | Adapter needed; must use strict PII/secrets controls |

## `/recipes` — Tools & Workflows

| Recipe | What it does | Contributor | Status |
|---|---|---:|---|
| Auto-Capture Protocol | Stores ACT NOW items and session summaries in Open Brain at session close using the reusable Auto-Capture skill | @jaredirish | Workflow needed |
| Panning for Gold | Mine brain dumps and voice transcripts for actionable ideas — battle-tested across 13+ sessions | @jaredirish | Workflow needed |
| Aiception (formerly Claudeception) | Self-improving system that creates new skills from work sessions — skills that create other skills | @jaredirish | Workflow needed; map to Hermes skills |
| Schema-Aware Routing | LLM-powered routing that distributes unstructured text across multiple database tables | @claydunker-yalc | Workflow/adapter needed |
| Fingerprint Dedup Backfill | Backfill content fingerprints and safely remove duplicate thoughts | @alanshurafa | Primitive/workflow; partially mapped by SHA-256 manifests |
| Source Filtering | Filter thoughts by source and backfill missing metadata for early imports | @matthallett1 | Workflow needed |
| Life Engine | Self-improving personal assistant — calendar, habits, health, proactive briefings via Telegram or Discord | @justfinethanku | Workflow needed; private-agent layer |
| Life Engine Video | Add-on that renders Life Engine briefings as short animated videos with voiceover | @justfinethanku | Workflow needed; media adapter |
| Daily Digest | Automated daily summary of recent thoughts delivered via email or Slack | OB1 Team | Workflow needed |
| Bring Your Own Context | Portable context workflow that packages extraction prompts, profile generation, and remote MCP deployment into one entrypoint | @jonathanedwards | Workflow needed; high priority for agent onboarding |
| Work Operating Model Activation | Conversation-first workflow that turns tacit work patterns into structured Open Brain records and agent-ready operating files | @jonathanedwards | Skill/workflow needed |
| World Model Diagnostic Activation | Ship-now activation path for a 20-minute world-model readiness diagnostic that compounds through core Open Brain capture | @jonathanedwards | Skill/workflow needed |
| Research-to-Decision Workflow | Composition recipe that chains canonical skills into operator and investor research, synthesis, meeting, and memo workflows | @NateBJones | Skill/workflow needed |

## `/skills` — Agent Skills

Plain-text skill packs agents can load as reusable building blocks.

| Skill | What it does | Contributor | Status |
|---|---|---:|---|
| Auto-Capture Skill Pack | Captures ACT NOW items and session summaries to Open Brain when a session ends | @jaredirish | Skill pack needed |
| Competitive Analysis Skill Pack | Builds competitor briefs, pricing comparisons, market maps, and strategic recommendations | @NateBJones | Skill pack needed |
| Financial Model Review Skill Pack | Reviews an existing model for assumption quality, structural risk, and scenario gaps | @NateBJones | Skill pack needed |
| Deal Memo Drafting Skill Pack | Turns existing diligence materials into structured deal, IC, or partnership memos | @NateBJones | Skill pack needed |
| Research Synthesis Skill Pack | Synthesizes source sets into findings, contradictions, confidence markers, and next questions | @NateBJones | Skill pack needed |
| Meeting Synthesis Skill Pack | Converts meeting notes or transcripts into decisions, action items, risks, and follow-up artifacts | @NateBJones | Skill pack needed |
| Panning for Gold Skill Pack | Turns brain dumps and transcripts into evaluated idea inventories | @jaredirish | Skill pack needed |
| Aiception Skill Pack (formerly Claudeception) | Extracts reusable lessons from work sessions into new skills | @jaredirish | Skill pack needed; map to Hermes skill creation |
| Work Operating Model Skill Pack | Runs a five-layer elicitation interview and saves the approved operating model into Open Brain | @jonathanedwards | Skill pack needed |
| World Model Readiness Diagnostic | Runs a 20-minute world-model diagnostic that maps paradigm fit, audits the boundary layer, and labels findings by confidence | @jonathanedwards | Skill pack needed |

## `/dashboards` — Frontend Templates

| Dashboard | What it does | Contributor | Status |
|---|---|---:|---|
| Open Brain Dashboard | SvelteKit dashboard with MCP proxy and Supabase auth | @headcrest | Template option |
| Open Brain Dashboard (Next.js) | Full-featured Next.js dashboard — 8 pages, dark theme, smart ingest, quality auditing | @alanshurafa | Template option; likely best fit for fast UI |

## `/integrations` — New Connections

| Integration | What it does | Contributor | Status |
|---|---|---:|---|
| Kubernetes Deployment | Fully self-hosted K8s deployment with PostgreSQL + pgvector — no Supabase required | @velo | Deployment option |
| Slack Capture | Quick-capture thoughts via Slack messages with auto-embedding and classification | Core | Integration needed |
| Discord Capture | Discord bot that captures messages into Open Brain, mirroring the Slack pattern | Core | Integration needed; high priority for current Discord usage |

## `/primitives` — Reusable Patterns

| Primitive | What it does | Contributor | Status |
|---|---|---:|---|
| Content Fingerprint Dedup | SHA-256 deduplication for thought ingestion — prevents duplicates across all import recipes | @alanshurafa | Primitive; should be mandatory for all import adapters |

## Implementation priority

1. **Primitive first:** content fingerprint dedupe + source metadata schema.
2. **Private import adapters:** Obsidian, ChatGPT, Google Takeout/Gmail, X/Grok.
3. **Capture integrations:** Discord and Slack capture into the same ingestion path.
4. **Agent workflows:** Auto-Capture, Panning for Gold, Research-to-Decision, Meeting Synthesis.
5. **Dashboard:** Next.js or SvelteKit UI over `wiki/dashboard/manifest.json`, graph JSON, and MCP search/read.

## Safety rules

- Raw imports stay private by default.
- Public wiki/dashboard output must be generated from approved public-safe sources or sanitized fake data.
- Every imported object needs provenance, source type, capture time, fingerprint, and redaction status.
- Email, DMs, browser history, Google Activity, and jobhunt material require extra PII/secrets filtering before any agent-wide indexing.

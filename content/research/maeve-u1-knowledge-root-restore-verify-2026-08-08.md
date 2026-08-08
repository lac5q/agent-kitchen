---
title: maeve-u1 knowledge root restore verification
model: claude-fable-5
sources: []
derived_from: 2026-08-07 beastmode session EACCES failure
regen_prompt: Verification artifact for the KNOWLEDGE_ROOT hijack fix on maeve-u1; safe to delete after v8.32 KNOWCENT-05 lands.
---

# maeve-u1 knowledge root restore — verification write

Verifies that after removing the rogue empty `~/github/knowledge` directory
(uid 100000, created 2026-08-07 by a userns-mapped container), a fresh
memroos MCP session resolves KNOWLEDGE_ROOT to MEMROOS_ROOT and
`knowledge_write` succeeds again. See GSD roadmap v8.32 Centralized
Knowledge Plane (Phase 199, KNOWCENT-01..05) for the durable fix.

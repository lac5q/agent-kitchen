# MemRoOS package options — embeddings & Hermes memory

**Document title:** MemRoOS Package Options (Embeddings + Hermes Dual-Mode)  
**Creation date:** 2026-07-16  
**Update date:** 2026-07-16  
**Document version:** 2026-07-16.1  

**Sources / data gathered:**
- Code: `apps/memroos/src/lib/embeddings/provider.ts`, `apps/memroos/src/lib/env.ts` (`MEMROOS_EMBEDDING_PROVIDER`: `null` | `ollama` only)
- Hermes dual-mode: `docs/integrations/hermes-memory-dual-mode.md`, `integrations/hermes/plugins/memory/memroos/`
- Voyage public pricing: [Voyage AI pricing](https://docs.voyageai.com/docs/pricing) (retrieved 2026-07-16)
- Roadmap residual: `.planning/ROADMAP.md` (v8.9 Voyage / LLM recall scoring — planned, not shipped)

---

## 1. What this package offers (options matrix)

| Option | Status in this package | Runs where | Cost model | When to use |
|--------|------------------------|------------|------------|-------------|
| **A. Embeddings off** | **Shipped (default)** | Nowhere | $0 | Macs with no room for local models; BM25 / non-semantic paths only |
| **B. Local Ollama embeddings** | **Shipped (opt-in)** | Your machine (`OLLAMA_URL`) | $0 API; needs disk/RAM for `nomic-embed-text` | Local-first semantic recall when Ollama is installed |
| **C. Voyage cloud embeddings** | **Planned — not implemented** | Voyage HTTP API (cloud); vectors may still live in Qdrant Cloud | Usage-based after free tier (see §3) | Better retrieval quality without a local embed model |
| **D. Hermes MEMORY.md only** | **Shipped (default)** | Hermes built-in | $0 | Everyday Hermes; no MemRoOS memory rewrite |
| **E. Hermes + MemRoOS observe** | **Shipped (opt-in)** | Hermes local + MemRoOS operator | Operator hosting only | Trial MemRoOS governance **without** replacing MEMORY.md |
| **F. Hermes MemRoOS-first rewrite** | **Deferred** | Would rewrite local MEMORY.md | — | Only if observe proves safer long-term |

**Hard packaging rule:** do not treat Voyage or Hermes rewrite as enabled features until their status column says shipped.

---

## 2. Embedding options (detail)

### Option A — Off (default)

```bash
# apps/memroos/.env.local or process env
# omit MEMROOS_EMBEDDING_PROVIDER, or:
MEMROOS_EMBEDDING_PROVIDER=null
```

- `embedText()` returns `{ embedding: null, degraded: true }` with **no network call**.
- No local model required.
- Semantic/hybrid recall degrades honestly to non-embedding paths.

### Option B — Local Ollama (shipped)

```bash
MEMROOS_EMBEDDING_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434   # default if unset
# Also used by mem0 path in root .env.example as OLLAMA_BASE_URL
```

Prereqs:

```bash
ollama pull nomic-embed-text
# mem0 LLM path (separate) may also need: ollama pull qwen2.5:3b
```

- Embeddings run **on your Mac/server**, not in Voyage’s cloud.
- Outages degrade gracefully (no 5xx from embed failures).

### Option C — Voyage cloud (package option, **not wired yet**)

**Intent:** call Voyage’s embedding HTTP API with an API key; store vectors in existing Qdrant Cloud (or local stores). **No Voyage model downloads onto the Mac.**

Planned env shape (document-only until implemented):

```bash
# NOT ACCEPTED by env.ts today — do not set in production yet
# MEMROOS_EMBEDDING_PROVIDER=voyage
# VOYAGE_API_KEY=...
# VOYAGE_MODEL=voyage-4-large   # or voyage-4 / voyage-4-lite
```

Current code only allows `null` | `ollama`. Setting `voyage` will fail typed env validation until a follow-on phase lands.

---

## 3. Voyage cost (as of 2026-07-16)

Source: [https://docs.voyageai.com/docs/pricing](https://docs.voyageai.com/docs/pricing)

| Model | Price after free tier | Free tokens per account |
|-------|----------------------|-------------------------|
| `voyage-4-large` | **$0.12 / 1M tokens** | 200 million |
| `voyage-4` | **$0.06 / 1M tokens** | 200 million |
| `voyage-4-lite` | **$0.02 / 1M tokens** | 200 million |

Rough intuition: first **200M tokens free**; afterward `voyage-4-large` ≈ **$1.20 per 10M tokens**.

Compare:

| Path | Cash cost | Local resource cost |
|------|-----------|---------------------|
| Off | $0 | None |
| Ollama | $0 API | Model weights + RAM/CPU/GPU on device |
| Voyage | Free tier then $/token | Network + API key only |

---

## 4. Hermes memory options (detail)

See also: [hermes-memory-dual-mode.md](./integrations/hermes-memory-dual-mode.md)

### Option D — Built-in only (default)

- Do **not** set `memory.provider: memroos`.
- Hermes MEMORY.md / USER.md behave as stock Hermes.
- MemRoOS is unrelated unless you use MCP/tools separately.

### Option E — Dual-mode observe (shipped, opt-in)

```bash
bash scripts/install-hermes-memroos-memory.sh
# optional dry-run (receipts only, no HTTP):
export MEMROOS_HERMES_DRY_RUN=1
# ~/.hermes/memroos-memory.json → mode: observe, rewrite_local: false
hermes config set memory.provider memroos
# later:
hermes memory off
```

- Built-in MEMORY.md stays **primary**.
- MemRoOS receives mirrored writes via `POST /api/native-memory/ingest` (fail-open).
- Receipts: `$HERMES_HOME/memroos-memory/observe-receipts.jsonl`
- **Never** rewrites MEMORY.md in v1 (`rewrite_local` forced false).

### Option F — Governed / rewrite-local

Deferred. Label may exist in config; rewrite is not enabled.

---

## 5. Recommended profiles

| Operator situation | Embeddings | Hermes memory |
|--------------------|------------|---------------|
| Slim Mac / no Ollama | **A — off** | **D** or **E** (observe dry-run) |
| Local-first with Ollama | **B — ollama** | **D** day-to-day; **E** when testing MemRoOS |
| Want better recall, no local model | **C — Voyage** (after implement) | **D** / **E** as above |
| Enterprise write governance trial | A or B | **E observe** first; do not jump to F |

---

## 6. Verification checklist

```bash
# Embeddings: default is off unless you set ollama
# Hermes plugin install (does not activate):
bash scripts/install-hermes-memroos-memory.sh --check

# Dual-mode unit tests
cd apps/memroos && npx vitest run src/lib/native-memory/__tests__/
python3 -m pytest integrations/hermes/plugins/memory/memroos/tests/ -q
```

---

## 7. Related files

| Path | Role |
|------|------|
| `apps/memroos/src/lib/embeddings/provider.ts` | Ollama / degraded embed client |
| `apps/memroos/src/lib/env.ts` | Allowed providers: `null`, `ollama` |
| `.env.example` | Package env knobs (commented options) |
| `docs/integrations/hermes-memory-dual-mode.md` | Hermes dual-mode how-to |
| `docs/embedding-migration-status.md` | Historical Ollama/mem0 migration notes |
| `.planning/goals/2026-07-16-hermes-dual-mode-memory.md` | Goal contract for dual-mode |

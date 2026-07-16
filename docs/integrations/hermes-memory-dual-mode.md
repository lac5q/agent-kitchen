# MemRoOS ↔ Hermes dual-mode memory

**Created:** 2026-07-16  
**Updated:** 2026-07-16  
**Version:** 2026-07-16.2  
**Source:** `.planning/goals/2026-07-16-hermes-dual-mode-memory.md`, Hermes memory-provider plugin API  

**Package options index:** [package-options-embeddings-hermes-memory.md](../package-options-embeddings-hermes-memory.md) (embeddings off / Ollama / Voyage planned + Hermes dual-mode matrix)  

## Why this exists

Replacing Hermes MEMORY.md outright risks breaking skills routing and day-to-day agent behavior. Hermes already supports **additive** external memory providers: built-in MEMORY.md stays on; at most one external provider can be attached.

MemRoOS ships an **opt-in** provider named `memroos` that starts in **observe** mode: it mirrors built-in writes to MemRoOS for governance testing and **never rewrites** local MEMORY.md.

## Modes

| Mode | Hermes MEMORY.md | MemRoOS | When to use |
|------|------------------|---------|-------------|
| *(provider off — default)* | Primary, unchanged | Not involved | Everyday use |
| `observe` | Primary, unchanged | Mirror ingest + local receipts | Local trial |
| `governed` | Still not rewritten in v1 | Same as observe today | Reserved label; no rewrite yet |

Disable anytime: `hermes memory off`.

## Install (does not activate)

```bash
bash scripts/install-hermes-memroos-memory.sh
bash scripts/install-hermes-memroos-memory.sh --check
```

This symlinks `integrations/hermes/plugins/memory/memroos` into your Hermes checkout’s `plugins/memory/memroos`.

## Activate for local testing

```bash
# Optional dry-run: write receipts only, no HTTP to MemRoOS
export MEMROOS_HERMES_DRY_RUN=1

# Or live mirror (MemRoOS app must be reachable)
export MEMROOS_AGENT_API_KEY=...
# optional: MEMROOS_OPERATOR_URL=http://127.0.0.1:3000

cat > ~/.hermes/memroos-memory.json <<'EOF'
{
  "mode": "observe",
  "operator_url": "http://127.0.0.1:3000",
  "rewrite_local": false
}
EOF

hermes config set memory.provider memroos
# use Hermes as usual, then:
#   ls ~/.hermes/memroos-memory/observe-receipts.jsonl
hermes memory off   # back to built-in only
```

## Hard rules

1. Fail-open: MemRoOS ingest errors never block Hermes memory writes.
2. `rewrite_local` is forced false in v1.
3. Skills-routing sections of MEMORY.md are not touched by this plugin.
4. Claude/Codex harness wiring is out of scope here.

## Where would Voyage (or similar) run?

**Not on your Mac as a local model.** Voyage is a **cloud HTTP embedding API**. MemRoOS already gates embeddings behind `MEMROOS_EMBEDDING_PROVIDER` (default path is Ollama/`nomic-embed-text` when you opt in, or no local embedder when unset). If Mac disk/RAM cannot host Ollama models, leave local embeddings off and — only if you later approve — point a remote provider flag at Voyage’s API. Qdrant Cloud can still store vectors; the embedder call happens remotely.

This dual-mode memory goal does **not** enable Voyage.

## Related code

- Plugin: `integrations/hermes/plugins/memory/memroos/`
- Operator sink: `POST /api/native-memory/ingest` (`apps/memroos/src/lib/native-memory/`)
- Installer: `scripts/install-hermes-memroos-memory.sh`

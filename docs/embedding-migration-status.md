# Embedding Migration Status Report

**Date**: 2026-05-16  
**Updated**: 2026-07-16 — package options matrix added (Voyage planned, not shipped)  
**Status**: COMPLETE - mem0 uses local Ollama for LLM + embeddings  
**Cost**: Local CPU/GPU only vs Gemini quota/billing  

**Current package options (embeddings + Hermes memory):** see
[`docs/package-options-embeddings-hermes-memory.md`](./package-options-embeddings-hermes-memory.md).
Default app embedding gate is `MEMROOS_EMBEDDING_PROVIDER=null` (off) or `ollama`
(local). Voyage cloud is documented as a future option only.

## 2026-05-16 Update

mem0 has been moved off Gemini and the old Vast/Jina path:

- LLM: `ollama` with `qwen2.5:3b`
- Embedder: `ollama` with `nomic-embed-text`
- Vector dimensions: 768
- Qdrant collection: `agent_memory_local`
- Replay queue: server startup now drains queued saves after backend recovery
- Required local models:
  - `ollama pull qwen2.5:3b`
  - `ollama pull nomic-embed-text`

---

## Current State

### Active Services
| Service | Status | Cost | Notes |
|---|---|---|---|
| Ollama | Active locally | Local | Serves mem0 LLM and embeddings |
| mem0 | Healthy | Local | Uses `agent_memory_local` in Qdrant |
| QMD Index | Local | Local | Uses qmd local model config |
| Vast.ai Instance | Destroyed | $0 | Historical migration path, no longer active |
| SSH Tunnel | Inactive | Free | Not needed for local Ollama |

### Security Fixes (2026-05-09)
- ✅ **GitHub Secret Scanning Alert #1**: Resolved
  - Removed hardcoded Telegram bot token from `services/memory/healthcheck.sh`
  - Removed hardcoded Qdrant API key from `services/memory/healthcheck.sh`
  - Replaced with environment variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `QDRANT_API_KEY`
  - **NOTE**: Tokens need to be rotated (were exposed in git history)

### Historical Vast.ai Instance
- **ID**: 36385878
- **Status**: **DESTROYED** (2026-05-09)
- **GPU**: RTX 4090
- **Model**: clip-ViT-L-14 (768-dim, multimodal)
- **Auto-destroy**: Enabled in batch script (60s after embedding)

### Serverless Status
- **Vast.ai Serverless**: **NOT USED** (auth issues during testing)
- **Current approach**: Local Ollama for mem0
- **Serverless script exists**: `services/memory/vast-serverless-embed.py` (not functional)

### Cleanup Completed
- ✅ Destroyed 7 extra instances (saved ~$200+/month)
- ✅ Removed agent-configs from QMD index (saved 1,532 docs)
- ✅ Updated mem0 config to use direct endpoint
- ✅ Added auto-destroy to batch script

---

## Cost Analysis

### Before Migration
| Component | Cost |
|---|---|
| Gemini embeddings2 | $90-120/month |
| Total | **$90-120/month** |

### 2026-05-16 Local mem0 State
| Component | Cost |
|---|---|
| Ollama LLM + embeddings | Local machine |
| Qdrant Cloud | Existing vector store |
| **Total incremental model cost** | **$0** |

### Historical Vast.ai Migration
| Component | Cost |
|---|---|
| Vast.ai (batch mode) | $0.29/hr |
| Weekly batch (4 hrs) | ~$5/month |
| Bi-weekly batch (4 hrs) | ~$2.50/month |
| Monthly batch (4 hrs) | ~$1.25/month |
| **Total** | **$1-5/month** |

### Savings
- **95%+ reduction** ($90-120/mo → $1-5/mo)
- **$85-119/month saved**

---

## Files Created/Modified

### New Files
- `docker/Dockerfile.embedding` - Pre-built Docker image
- `docker/server.py` - FastAPI embedding server
- `scripts/vast-docker-deploy.sh` - Deployment script
- `scripts/batch-embed.sh` - Batch embedding runner (with auto-destroy)
- `scripts/vast-startup.sh` - Vast.ai startup script
- `services/memory/vast-serverless-embed.py` - Serverless option (not used)
- `services/memory/local-embed-server.py` - Local Mac option (not used)
- `services/memory/.env` - Environment variables
- `services/memory/.env.example` - Environment template
- `docs/embedding-migration-decision.md` - Decision record

### Modified Files
- `services/memory/mem0-config.yaml` - Updated to use local Ollama
- `.env.example` - Added OLLAMA_BASE_URL
- `docker-compose.yml` - Added Ollama base URL
- `collections.config.json` - Removed agent-configs collection

---

## Git History

```
17ba3c2 chore: add serverless embedding script and update agent lightning approvals
c082d7a docs: update decision record with instance cleanup and auto-destroy
c3aa365 fix: add auto-destroy to batch embed script and update mem0 config
1f9d85d docs: update embedding migration decision with final working config
550f953 fix: update startup script with compatible versions
77a0cc8 fix: update Dockerfile and deployment script
3c49099 docs: add embedding migration decision record
55faf2a feat: add Docker-based Vast.ai embedding server
ee61228 feat: complete embedding migration to clip-ViT-L-14
2ca455e chore: update documentation and knowledge-mcp service
d2124fd fix: add .env.example for mem0 service
32460b5 fix: use localhost SSH tunnel for embedding API
3ee2e58 fix: update embedding model to clip-ViT-L-14 with correct port mapping
f79c937 Merge branch 'main'
08988bf Merge branch 'codex/rebrand-agentkitche-dev'
9de4edb Merge remote-tracking branch 'origin/codex/opencode-onboarding-mcp'
c6d246f migrate embeddings from Gemini to jina-clip-v2 on Vast.ai
```

---

## How to Use

### Run Batch Embedding
```bash
./scripts/batch-embed.sh
```
- Spins up Vast.ai instance
- Runs QMD embeddings
- Tests mem0
- Auto-destroys instance after 60 seconds

### Manual Instance Management
```bash
# Check instances
vastai show instances

# Destroy instance
vastai destroy instance 36385878 --yes

# Create instance (if needed)
./scripts/vast-docker-deploy.sh
```

### SSH Tunnel (if needed)
```bash
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -f -N \
    -p 25878 -L 8001:localhost:8000 root@ssh6.vast.ai
```

---

## Future Optimization Options

1. **Cloud API**: Together AI or Fireworks ($10-30/mo, no infra)
2. **Local Mac**: Fix clip-ViT-L-14 loading ($0/mo)
3. **Smaller model**: 384-dim for cost savings
4. **Spot instances**: 50% cost reduction (less reliable)

---

## Testing Results

| Test | Status | Details |
|---|---|---|
| Embedding creation | ✅ | 768-dim vectors generated |
| Embedding search | ✅ | Semantic search working |
| mem0 integration | ✅ | Connected and tested |
| QMD index | ✅ | 3,879 files indexed |
| SSH tunnel | ✅ | localhost:8001 active |
| Auto-destroy | ✅ | Enabled in batch script |

---

## Notes

- **Docker build**: Failed due to PyTorch version incompatibility on ARM Mac
- **SSH tunneling**: Proved reliable for batch jobs
- **Direct port access**: Works for embedding endpoint
- **Vast.ai Serverless**: Had auth issues during testing
- **Local Mac**: Model loading issues (clip-ViT-L-14 compatibility)

---

**Last Updated**: 2026-05-09  
**Next Review**: Weekly batch scheduling

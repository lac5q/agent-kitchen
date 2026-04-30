# Phase 28 Summary: Monorepo CI and Deploy Hardening

## Result

Completed. The monorepo now has a CI workflow that validates the Kitchen app and Python service surface, and the merged v1.6 code is deployed through the production LaunchAgent.

## Shipped

- Added `.github/workflows/ci.yml`.
- CI covers Kitchen dependency install, Vitest suite, production build, Knowledge MCP tests, Python compile smoke, and shell script syntax checks.
- Production was rebuilt and restarted on port `3002`.
- Live health endpoints confirmed after restart.
- GSD planning state updated for v1.6.

## Validation

- `npm --prefix apps/kitchen run test -- --run` passed: 42 files, 331 tests.
- `PYTHONPATH=services/knowledge-mcp ... python -m pytest services/knowledge-mcp/tests` passed: 10 tests.
- `python3 -m py_compile services/memory/*.py services/knowledge-mcp/knowledge_system/*.py` passed.
- `bash -n start.sh services/memory/*.sh` passed.
- `npm run build` passed with the known Turbopack NFT warning on `/api/apo`.
- `GET /api/health` returned `200` after deployment.
- `GET /api/tool-attention?limit=3` returned `200` after deployment.

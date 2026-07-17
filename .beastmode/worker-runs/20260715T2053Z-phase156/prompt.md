# Worker Contract — Phase 156 Strict-Gate Diagnostics + Path-Scoped Disk

**Model:** MiniMax-M3  
**Director:** Grok 4.5  
**Date:** 2026-07-15

## Goal
GATE-RESILE-03: Better strict-gate diagnostics; path-scoped disk so home df% alone does not map to vector=down.

## Scope (ALLOWED FILES ONLY)
1. `services/memory/mem0-server.py` — path-scoped `check_disk_space` / health disk aggregation
2. `apps/memroos/src/lib/memory/backends.ts` — vector mapping: connected vector_store + available runtime must not become `down` solely from disk; prefer `up` with disk detail or keep disk out of vector status
3. `scripts/memroos-mcp.sh` — enrich failure messages with tier=status(+detail) without printing API keys
4. Tests:
   - `services/memory/tests/test_path_scoped_disk.py` (create)
   - `apps/memroos/src/lib/memory/__tests__/backends-disk-vector.test.ts` (create)

## Non-goals
- Do not widen MEMROOS_ALLOWED_MEMORY_TIER_STATUSES defaults
- Do not unset MEMROOS_REQUIRE_SERVER_MEMORY
- Do not commit/push

## Constraints
- Keep MEMROOS_REQUIRE_SERVER_MEMORY=1 semantics
- Disk critical on home alone must NOT force vector tier `down` when vector_store=connected
- Prefer checking QUEUE_DB_PATH parent + LOG_DIR for critical disk decisions
- Diagnostics must never print MEMROOS_AGENT_API_KEY / bearer tokens

## Required output
Unified diffs + summary + tests.

## check_disk_space + health is_ok excerpt
def check_disk_space(path: str = "~") -> dict:
    """Check disk space and return status.

    Defaults are sized for local Docker Desktop volumes. The old absolute
    thresholds (critical <10GB, warning <20GB) made a 23.5GB Docker disk look
    unhealthy even when it was less than half full.
    """
    try:
        usage = shutil.disk_usage(os.path.expanduser(path))
        percent_used = (usage.used / usage.total) * 100
        gb_free = usage.free / (1024**3)
        critical_free_gb = float(os.environ.get("MEM0_DISK_CRITICAL_FREE_GB", "2"))
        warning_free_gb = float(os.environ.get("MEM0_DISK_WARNING_FREE_GB", "8"))
        critical_percent = float(os.environ.get("MEM0_DISK_CRITICAL_PERCENT", "95"))
        warning_percent = float(os.environ.get("MEM0_DISK_WARNING_PERCENT", "85"))
        return {
            "total_gb": round(usage.total / (1024**3), 1),
            "used_gb": round(usage.used / (1024**3), 1),
            "free_gb": round(gb_free, 1),
            "percent_used": round(percent_used, 1),
            "critical": percent_used > critical_percent or gb_free < critical_free_gb,
            "warning": percent_used > warning_percent or gb_free < warning_free_gb,
        }
    except Exception as e:
        return {"error": str(e), "critical": True}


def check_sqlite_db(db_path: str | None = None) -> dict:
    """Check SQLite database health."""
    import sqlite3
    db_path = str(db_path or QUEUE_DB_PATH)
    result = {"path": db_path, "status": "unknown"}

    try:
        full_path = os.path.expanduser(db_path)
        if not os.path.exists(full_path):

## backends vector health mapping
  if (!response.ok || (Array.isArray(result.errors) && result.errors.length > 0)) {
    throw new Error("Graph memory backend unavailable");
  }
  return result;
}

async function _checkVectorHealthDirect(): Promise<MemoryTierHealth> {
  try {
    const response = await fetch(`${MEM0_URL}/health`, { signal: timeoutSignal(mem0HealthTimeoutMs()) });
    if (!response.ok) {
      return { tier: "vector", backend: "mem0-qdrant", status: "down", detail: `HTTP ${response.status}` };
    }

    const body = await response.json().catch(() => ({}));
    const details: string[] = [];
    const queued = typeof body.queue?.queued === "number" ? body.queue.queued : 0;
    const vectorStore = typeof body.vector_store === "string" ? body.vector_store : "unknown";
    const runtime = body.memory_runtime as { status?: string; error?: string } | undefined;

    if (body.status === "degraded") details.push("mem0 reports degraded");
    if (queued > 0) details.push(`${queued} queued memory saves`);
    if (vectorStore !== "connected") {
      details.push(`vector store ${vectorStore}`);
    }
    if (runtime?.status && runtime.status !== "available") {
      details.push(`runtime ${runtime.status}${runtime.error ? `: ${runtime.error}` : ""}`);
    }

    return {
      tier: "vector",
      backend: "mem0-qdrant",
      status: details.length > 0 ? "degraded" : "up",
      detail: details.length > 0 ? details.join("; ") : undefined,
    };
  } catch (error) {
    return { tier: "vector", backend: "mem0-qdrant", status: "down", detail: error instanceof Error ? error.message : undefined };
  }
}

async function _checkGraphHealthDirect(): Promise<MemoryTierHealth> {
  const config = neo4jConfig();
  if (!config.password) return { tier: "graph", backend: "neo4j", status: "not_configured" };
  try {
    await _queryGraphMemoryDirect("", 1);

## strict gate error assembly
strict_fail() {
  echo "MemRoOS server memory unavailable: $*" >&2
  echo "Unset MEMROOS_REQUIRE_SERVER_MEMORY to allow repo-local MCP tools without server memory." >&2
  exit 78
}

require_server_memory_access() {
  is_true "$MEMROOS_REQUIRE_SERVER_MEMORY" || return 0

  command -v curl >/dev/null 2>&1 || strict_fail "curl is required for strict memory checks"
  command -v jq >/dev/null 2>&1 || strict_fail "jq is required for strict memory checks"

  local app_url agent_id key inbox_file health_file code unhealthy_tiers allowed_tier_statuses
  local attempts delay timeout attempt last_error
  app_url="${MEMROOS_APP_URL:-${MEMROOS_BASE_URL:-http://localhost:3002}}"
  app_url="${app_url%/}"
  agent_id="${MEMROOS_AGENT_ID:-}"
  key="${MEMROOS_AGENT_API_KEY:-}"
  allowed_tier_statuses=",${MEMROOS_ALLOWED_MEMORY_TIER_STATUSES//[[:space:]]/},"
  attempts="$(positive_int_or_default "$MEMROOS_MCP_STRICT_CHECK_ATTEMPTS" 5)"
  delay="$(nonnegative_int_or_default "$MEMROOS_MCP_STRICT_CHECK_RETRY_DELAY_SEC" 2)"
  timeout="$(positive_int_or_default "$MEMROOS_MCP_STRICT_CHECK_TIMEOUT_SEC" 10)"

  [[ -n "$agent_id" ]] || strict_fail "MEMROOS_AGENT_ID could not be resolved"
  [[ -n "$key" ]] || strict_fail "MEMROOS_AGENT_API_KEY could not be loaded for ${agent_id}"

  inbox_file="$(mktemp -t memroos-mcp-agent-context.XXXXXX.json)"
  health_file="$(mktemp -t memroos-mcp-memory-health.XXXXXX.json)"
  trap 'rm -f "$inbox_file" "$health_file"' RETURN

  for attempt in $(seq 1 "$attempts"); do
    code="$(curl -sS -o "$inbox_file" -w "%{http_code}" \
      "${app_url}/api/agent-context/messages?agent=${agent_id}&box=inbox&status=pending&limit=1" \
      -H "Authorization: Bearer ${key}" \
      --max-time "$timeout" 2>/dev/null || true)"
    if [[ ! "$code" =~ ^2 ]]; then
      last_error="agent-context auth check failed for ${agent_id} at ${app_url} (HTTP ${code:-curl_failed})"
    elif ! jq -e '.ok == true' "$inbox_file" >/dev/null; then
      last_error="agent-context auth check returned an unexpected response for ${agent_id}"
    else
      code="$(curl -sS -o "$health_file" -w "%{http_code}" \
        "${app_url}/api/memory/health" \
        -H "Authorization: Bearer ${key}" \
        --max-time "$timeout" 2>/dev/null || true)"
      if [[ ! "$code" =~ ^2 ]]; then
        last_error="memory health check failed at ${app_url}/api/memory/health (HTTP ${code:-curl_failed})"
      elif ! jq -e '.ok == true and (.tiers | type == "array")' "$health_file" >/dev/null; then
        last_error="memory health check returned an unexpected response"
      else
        unhealthy_tiers="$(jq -r --arg allowed "$allowed_tier_statuses" \
          '[.tiers[]?
            | (.status | tostring) as $status
            | select($status != "up" and ($allowed | contains("," + $status + ",") | not))
            | "\(.tier)=\($status)"
          ] | join(", ")' "$health_file")"
        if [[ -z "$unhealthy_tiers" ]]; then
          if [[ "$attempt" -gt 1 ]]; then
            echo "MemRoOS strict memory check recovered on attempt ${attempt}/${attempts}." >&2
          fi
          return 0
        fi
        last_error="memory tiers are not healthy: ${unhealthy_tiers}"
      fi
    fi

    if [[ "$attempt" -lt "$attempts" ]]; then
      echo "MemRoOS strict memory check attempt ${attempt}/${attempts} failed: ${last_error}; retrying in ${delay}s." >&2
      sleep "$delay"
    fi
  done

  strict_fail "${last_error:-strict memory check failed}"
}

Implement. Unified diffs only.

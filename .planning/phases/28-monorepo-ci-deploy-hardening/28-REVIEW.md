---
phase: 28-monorepo-ci-deploy-hardening
reviewed: 2026-04-30T18:19:51Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - .github/workflows/ci.yml
  - .github/workflows/secret-guard.yml
  - apps/kitchen/next.config.ts
  - apps/kitchen/src/app/api/tool-attention/route.ts
  - apps/kitchen/src/app/cookbooks/page.tsx
  - apps/kitchen/src/app/flow/page.tsx
  - apps/kitchen/src/components/cookbooks/tool-attention-panel.tsx
  - apps/kitchen/src/components/flow/node-detail-panel.tsx
  - apps/kitchen/src/components/flow/react-flow-canvas.tsx
  - apps/kitchen/src/lib/api-client.ts
  - apps/kitchen/src/lib/node-keyword-map.ts
  - apps/kitchen/src/lib/paths.ts
  - apps/kitchen/src/lib/tool-attention.ts
  - apps/kitchen/src/types/index.ts
  - services/knowledge-mcp/knowledge_system/capabilities.py
  - services/knowledge-mcp/knowledge_system/mcp_server.py
  - services/knowledge-mcp/knowledge_system/tool_attention.py
  - services/knowledge-mcp/tool-catalog.json
findings:
  critical: 3
  warning: 5
  info: 0
  total: 8
status: issues_found
---

# Phase 28: Code Review Report

**Reviewed:** 2026-04-30T18:19:51Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Reviewed the monorepo CI workflows, Next.js Kitchen tool-attention UI/API path, React Flow updates, and the Python knowledge MCP progressive-disclosure surface. The main blockers are in secret/PII guard coverage and filesystem path disclosure from the tool-attention catalog.

Verification performed: `npm --prefix apps/kitchen run test -- --run` passed, `npm run build` passed with a Turbopack tracing warning, `python3 -m py_compile services/memory/*.py services/knowledge-mcp/knowledge_system/*.py` passed, `bash -n start.sh services/memory/*.sh` passed. Local `python` is unavailable and local `python3` does not have `pytest`; CI installs pytest before running Python tests.

## Critical Issues

### CR-01: BLOCKER - Secret Guard Misses Most macOS Home Paths

**File:** `.github/workflows/secret-guard.yml:48`

**Issue:** The username regex uses one negated character class per character in `yourname`, then requires the slash immediately after those eight characters. That only catches a narrow subset of eight-character usernames and misses common paths such as `/Users/alice/project` and `/Users/yourname/github`, so the PII guard can pass leaked local home paths.

**Fix:**
```bash
PATTERNS='/Users/[^/]+/|/home/[^/]+/'
MATCHES=$(git grep -nE "$PATTERNS" -- '*.md' '*.ts' '*.tsx' '*.js' '*.json' '*.yaml' '*.yml' '*.sh' '*.py' \
  | grep -v '^.github/workflows/secret-guard.yml:' \
  | grep -v '/Users/yourname/' \
  || true)
```

### CR-02: BLOCKER - Nested `.env.local` Files Are Not Blocked

**File:** `.github/workflows/secret-guard.yml:73`

**Issue:** The guard only checks for a repository-root `.env.local`. In this monorepo the Kitchen app lives under `apps/kitchen`, so a committed `apps/kitchen/.env.local` would bypass the workflow even though it is the app-local secret file Next.js commonly loads.

**Fix:**
```bash
if git ls-files | grep -Eq '(^|/)\.env\.local$'; then
  echo "IN-REPO .env.local is committed - move secrets to .env.example with placeholders"
  exit 1
fi
```

### CR-03: BLOCKER - Tool-Attention Catalog Exposes Absolute Local Paths

**File:** `apps/kitchen/src/lib/tool-attention.ts:257`, `services/knowledge-mcp/knowledge_system/tool_attention.py:235`

**Issue:** Both the browser API response and MCP `tool-attention` catalog include `sources` with absolute paths, plus `catalogPath` and `outcomesPath` values. The default skills source also uses the user's home directory. Any caller of `/api/tool-attention` or the MCP catalog can learn local usernames and filesystem layout, which conflicts with the secret guard's explicit goal of blocking real username paths.

**Fix:**
```ts
function publicSource(source: ToolAttentionSource): ToolAttentionSource {
  return {
    id: source.id,
    label: source.label,
    type: source.type,
    status: source.status,
    path: source.path ? path.basename(source.path) : undefined,
  };
}

// Apply before returning JSON and omit absolute health paths.
sources: uniqueSources.map(publicSource),
health: {
  status: fs.existsSync(catalogPath()) ? "ok" : "degraded",
  messages: healthMessages,
}
```

Mirror the same redaction in `services/knowledge-mcp/knowledge_system/tool_attention.py` before returning `sources`, `health`, and `record_outcome` metadata.

## Warnings

### WR-01: WARNING - Kitchen CI Does Not Run The Existing Lint Gate

**File:** `.github/workflows/ci.yml:27`

**Issue:** The Kitchen job runs tests and build, but skips the app's `lint` script. Local lint currently reports React Compiler purity errors and TypeScript rule violations, so the workflow can pass code that violates the configured quality gate.

**Fix:** After clearing the current lint debt, add a CI step before build:
```yaml
- name: Run Kitchen lint
  run: npm --prefix apps/kitchen run lint
```

### WR-02: WARNING - Mutable TruffleHog Action Reference Weakens Secret-Scan Reproducibility

**File:** `.github/workflows/secret-guard.yml:20`

**Issue:** `trufflesecurity/trufflehog@main` tracks a mutable branch. A scan can change behavior or break without any repository change, and a compromised upstream branch would execute in CI.

**Fix:** Pin the action to a reviewed version or commit SHA:
```yaml
uses: trufflesecurity/trufflehog@v3.90.8
```

### WR-03: WARNING - Turbopack Build Traces The Whole Project

**File:** `apps/kitchen/src/lib/paths.ts:17`

**Issue:** `next build` completed but emitted: "A file was traced that indicates that the whole project was traced unintentionally." The scoped path helper builds repo-root paths dynamically and route modules use those paths for filesystem reads. That can bloat deployment traces and increases the chance of packaging files outside the app boundary.

**Fix:** Keep route file access statically scoped to known subdirectories and use Turbopack ignore comments where dynamic repo-root resolution is unavoidable:
```ts
return path.join(/* turbopackIgnore: true */ getRepoRoot(), ...segments);
```
Prefer dedicated helpers for known files such as `.mcp.json` and `services/knowledge-mcp/tool-catalog.json` so the trace stays bounded.

### WR-04: WARNING - React Flow Status And Click Stats Can Go Stale

**File:** `apps/kitchen/src/components/flow/react-flow-canvas.tsx:342`

**Issue:** The nodes memo suppresses exhaustive deps while reading `services` through `getStatus`, and the click handler suppresses deps while reading live counts through `nodeStats`. Health status changes or count updates can fail to update node colors and detail-panel stats until another listed dependency changes.

**Fix:** Make `getStatus` and `nodeStats` stable callbacks with complete dependencies, then include them in the memo/click dependencies instead of suppressing the rule.

### WR-05: WARNING - One Malformed Outcome Row Drops All Recent Outcomes

**File:** `apps/kitchen/src/lib/tool-attention.ts:46`

**Issue:** `readOutcomes` parses every JSONL line inside one outer `try`. If one log line is truncated or malformed, the catch returns `[]`, hiding all valid recent outcome records. The Python implementation already handles malformed rows per line, so the dashboard can disagree with the MCP catalog.

**Fix:**
```ts
const outcomes: ToolAttentionOutcome[] = [];
for (const line of fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean).slice(-limit)) {
  try {
    outcomes.push(JSON.parse(line) as ToolAttentionOutcome);
  } catch {
    // Skip corrupt rows but keep valid history.
  }
}
return outcomes.reverse();
```

---

_Reviewed: 2026-04-30T18:19:51Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

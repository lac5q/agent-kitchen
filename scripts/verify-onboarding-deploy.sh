#!/usr/bin/env bash
# Verify operator production serves onboarding routes through token auth, not JWT proxy.
# Phase 186 (v8.28 / TOPOPROD-04): extended into a post-deploy profile check
# that asserts every `required: true` production service is healthy.
# Reads MEMROOS_PROFILE (default: production) and the manifest at
# apps/memroos/src/lib/runtime-topology.json, then probes each required
# service's health endpoint and exits non-zero on any failure.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${MEMROOS_PROFILE:-production}"
BASE="${MEMROOS_PUBLIC_URL:-https://memroos.epiloguecapital.com}"

# --- 1. Onboarding token-auth smoke (legacy Phase 165 check) ---
SCRIPT_URL="${BASE}/api/onboarding/script?token=bad"
code="$(curl -sS -o /tmp/memroos-onboarding-verify.txt -w "%{http_code}" "$SCRIPT_URL" || true)"
body="$(tr '\n' ' ' < /tmp/memroos-onboarding-verify.txt 2>/dev/null | head -c 200)"

if [[ "$code" == "403" ]]; then
  echo "OK: onboarding script reachable (HTTP 403 for bad token): ${body}"
elif [[ "$code" == "401" ]]; then
  echo "FAIL: proxy still requires JWT (HTTP 401). Deploy or DNS may be stale." >&2
  echo "body: ${body}" >&2
  exit 1
else
  echo "FAIL: unexpected HTTP ${code} from ${SCRIPT_URL}" >&2
  echo "body: ${body}" >&2
  exit 1
fi

# --- 2. Required production services health check (Phase 186 / TOPOPROD-04) ---
# Use the runtime-topology CLI to validate the production profile's
# topology FIRST. Phase 186 enforces that the systemd unit files
# under deploy/oracle-1/systemd/ are committed and consistent with
# the manifest's deployUnit entries. A missing or mismatched unit
# file is a hard error — we do NOT continue past this gate.
if ! node "$REPO_ROOT/scripts/check-runtime-topology.mjs" "$PROFILE" >/dev/null; then
  echo "FAIL: runtime-topology gate failed for $PROFILE profile. Run 'npm run check:runtime-topology -- $PROFILE' to see the errors." >&2
  exit 2
fi

# Read the manifest directly (no extra dep) to enumerate the
# production profile's required services. Kept simple so the script
# can run in CI without a node-side parser.
node --input-type=module -e "
import('node:fs').then(async (fs) => {
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const manifest = JSON.parse(fs.readFileSync('$REPO_ROOT/apps/memroos/src/lib/runtime-topology.json', 'utf8'));
  const profileName = '$PROFILE';
  const profile = manifest.profiles?.[profileName] ?? { services: manifest.services };
  const required = (profile.services ?? []).filter((s) => s.required !== false);
  // The public memroos-app covers the public probe (the BASE URL).
  // Internal services (mem0, orchestration, connmem, knowledge-mcp) are
  // expected to be reachable from inside the tunnel via the loopback
  // port listed in the manifest. Operators set MEMROOS_INTERNAL_BASE
  // when running this script from inside oracle-1; the public URL
  // is the default for SaaS-runs.
  const internalBase = process.env.MEMROOS_INTERNAL_BASE || 'http://127.0.0.1';
  for (const svc of required) {
    if (svc.id === 'healthcheck') {
      // The healthcheck service is a systemd timer; not an HTTP probe.
      continue;
    }
    // Pick the first port with an integer defaultPort. The previous
    // predicate (\`p.defaultPort < 1024 || Number.isInteger(p.defaultPort)\`)
    // was tautological -- the right side is always true when p is well-formed.
    // NOTE: those two backticks MUST stay backslash-escaped: this whole node
    // script is embedded inside a bash double-quoted string, and an
    // unescaped backtick pair here is command substitution to bash, not a
    // JS code span -- bash tries to run the quoted text as a shell command
    // and fails with a syntax error, on every real invocation, even though
    // the JS logic itself is already correct. Verified live on oracle-1.
    // Prefer the loopback-reachable port (low defaultPort) so the
    // probe works from inside oracle-1.
    const port = (svc.ports ?? []).find((p) => Number.isInteger(p.defaultPort));
    // For the public memroos-app, use BASE. For internal services, use
    // the internal loopback port.
    const base = svc.id === 'memroos-app' ? '$BASE' : internalBase;
    if (!port) {
      console.error(\`WARN: \${svc.id} has no port in profile, skipping\`);
      continue;
    }
    const url = \`\${base}:\${port.defaultPort}\${svc.health?.path ?? '/health'}\`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) {
        console.error(\`FAIL: required service \${svc.id} at \${url} returned HTTP \${r.status}\`);
        process.exit(1);
      }
      console.log(\`OK: \${svc.id} (\${url}) -> \${r.status}\`);
    } catch (err) {
      console.error(\`FAIL: required service \${svc.id} at \${url} unreachable: \${err?.message ?? err}\`);
      process.exit(1);
    }
  }
}).catch((err) => {
  console.error('verify-onboarding-deploy: required-services probe failed:', err);
  process.exit(1);
});
"

echo "OK: required services healthy on $PROFILE profile"

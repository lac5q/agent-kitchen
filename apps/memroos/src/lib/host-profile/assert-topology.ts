/**
 * CFGDUR-02 (Phase 196) — startup topology assertion.
 *
 * WHY THIS IS THE PRIMARY CONTROL, NOT A FALLBACK
 *
 * oracle-1 ran for months with `NEO4J_HTTP_URL` resolving to a throwaway local
 * container instead of Neo4j Aura. The app started, served traffic, and wrote
 * graph data — to the wrong place. No error, no degraded health, no alert.
 *
 * The obvious fixes do not work. Measured on oracle-1 (compose v5.3.0,
 * 2026-07-26): an explicit `-f` on the command line overrides BOTH the
 * automatic `docker-compose.override.yml` pickup AND the `COMPOSE_FILE`
 * environment variable:
 *
 *   docker compose -f local.yml config                    -> local neo4j  ✗
 *   COMPOSE_FILE=local:override docker compose -f local.yml config -> local neo4j  ✗
 *   COMPOSE_FILE=local:override docker compose config     -> aura         ✓
 *
 * The invocation that caused the outage was row 1. Since the flag wins by
 * design, no compose-level or env-var-level control can defend against it.
 * The only mechanism that survives an arbitrary `-f` is the app checking, at
 * boot, whether what it actually resolved matches what the host declared.
 *
 * FAIL-CLOSED, BUT NOT IN DEV. A host with no declared profile is unmanaged
 * (local dev, CI, ephemeral containers) and is left alone. Once a host
 * declares an expectation, violating it is fatal by default — booting anyway
 * is what produced months of silent data misrouting.
 */

export type GraphBackend = "aura" | "local";
export type VectorBackend = "qdrant-cloud" | "local" | "none";

export interface TopologyExpectation {
  hostId: string;
  graph: GraphBackend;
  vector: VectorBackend;
}

export interface TopologyActual {
  neo4jHttpUrl?: string;
  qdrantUrl?: string;
}

export interface TopologyViolation {
  field: "graph" | "vector";
  expected: string;
  actualDescription: string;
  message: string;
}

const AURA_HOST_FRAGMENT = "databases.neo4j.io";
const QDRANT_PLACEHOLDERS = ["your-qdrant-cloud-endpoint", "changeme", "change-me"];

function describeGraph(url: string | undefined): GraphBackend | "unset" {
  if (!url) return "unset";
  return url.includes(AURA_HOST_FRAGMENT) ? "aura" : "local";
}

function isPlaceholder(url: string): boolean {
  const lowered = url.toLowerCase();
  return QDRANT_PLACEHOLDERS.some((p) => lowered.includes(p));
}

/**
 * Read the declared expectation from the environment. Returns null when this
 * host declares nothing — the unmanaged case, which is not an error.
 */
export function readExpectation(
  env: NodeJS.ProcessEnv = process.env,
): TopologyExpectation | null {
  const hostId = env.MEMROOS_HOST_ID?.trim();
  const graph = env.EXPECT_GRAPH_BACKEND?.trim() as GraphBackend | undefined;
  const vector = env.EXPECT_VECTOR_BACKEND?.trim() as VectorBackend | undefined;
  if (!hostId || !graph) return null;
  return { hostId, graph, vector: vector ?? "none" };
}

/**
 * Compare declared topology against what actually resolved. Pure and
 * synchronous so it is cheap to call at boot and trivial to test.
 */
export function findTopologyViolations(
  expected: TopologyExpectation,
  actual: TopologyActual,
): TopologyViolation[] {
  const violations: TopologyViolation[] = [];

  const actualGraph = describeGraph(actual.neo4jHttpUrl);
  if (actualGraph !== expected.graph) {
    violations.push({
      field: "graph",
      expected: expected.graph,
      actualDescription: actualGraph === "unset" ? "unset" : `${actualGraph} (${actual.neo4jHttpUrl})`,
      message:
        expected.graph === "aura"
          ? `Host '${expected.hostId}' declares graph backend 'aura', but NEO4J_HTTP_URL resolved to ${actualGraph === "unset" ? "nothing" : "a non-Aura endpoint"}. Graph writes would land in the wrong store. The compose override was almost certainly bypassed — an explicit 'docker compose -f docker-compose.local.yml up' does exactly this.`
          : `Host '${expected.hostId}' declares graph backend 'local', but NEO4J_HTTP_URL points at Aura. This would write to shared cloud state unintentionally.`,
    });
  }

  if (expected.vector !== "none") {
    const url = actual.qdrantUrl?.trim();
    if (!url) {
      violations.push({
        field: "vector",
        expected: expected.vector,
        actualDescription: "unset",
        message: `Host '${expected.hostId}' declares vector backend '${expected.vector}', but QDRANT_URL is unset. Vector writes have nowhere to go.`,
      });
    } else if (isPlaceholder(url)) {
      violations.push({
        field: "vector",
        expected: expected.vector,
        actualDescription: `placeholder (${url})`,
        message: `Host '${expected.hostId}' declares vector backend '${expected.vector}', but QDRANT_URL is still a placeholder. This is the exact state oracle-1 shipped in for months.`,
      });
    }
  }

  return violations;
}

export function formatViolations(violations: TopologyViolation[]): string {
  const lines = [
    "",
    "  ✗ HOST TOPOLOGY MISMATCH (CFGDUR-02)",
    "",
    "  This host declares a backend topology that does not match what the",
    "  application actually resolved at startup.",
    "",
  ];
  for (const v of violations) {
    lines.push(`  • ${v.field}: expected '${v.expected}', got '${v.actualDescription}'`);
    lines.push(`    ${v.message}`);
    lines.push("");
  }
  lines.push("  Restart with the host's full compose file set:");
  lines.push("    scripts/memroos-restart.sh");
  lines.push("");
  lines.push("  To boot anyway (data may be written to the wrong backend):");
  lines.push("    MEMROOS_ALLOW_TOPOLOGY_MISMATCH=1");
  lines.push("");
  return lines.join("\n");
}

/**
 * Boot gate. Throws on mismatch unless explicitly overridden.
 * No-ops when the host declares no expectation.
 */
export function assertHostTopology(
  env: NodeJS.ProcessEnv = process.env,
  log: (msg: string) => void = console.error,
): void {
  const expected = readExpectation(env);
  if (!expected) return;

  const violations = findTopologyViolations(expected, {
    neo4jHttpUrl: env.NEO4J_HTTP_URL,
    qdrantUrl: env.QDRANT_URL,
  });
  if (violations.length === 0) return;

  log(formatViolations(violations));

  if (env.MEMROOS_ALLOW_TOPOLOGY_MISMATCH === "1") {
    log("  MEMROOS_ALLOW_TOPOLOGY_MISMATCH=1 set — continuing despite mismatch.\n");
    return;
  }
  throw new Error(
    `Host topology mismatch on '${expected.hostId}': ${violations.map((v) => v.field).join(", ")}. Refusing to start. See CFGDUR-02.`,
  );
}

import { describe, expect, it, vi } from "vitest";
import {
  assertHostTopology,
  findTopologyViolations,
  readExpectation,
} from "../assert-topology";

const AURA = "https://abc123.databases.neo4j.io";
const LOCAL_NEO4J = "http://neo4j:7474";
const QDRANT_CLOUD = "https://xyz.us-west-1-0.aws.cloud.qdrant.io";

describe("readExpectation", () => {
  it("returns null when the host declares nothing (dev/CI is unmanaged)", () => {
    expect(readExpectation({})).toBeNull();
  });

  it("returns null when host id is present but graph backend is not", () => {
    expect(readExpectation({ MEMROOS_HOST_ID: "x" })).toBeNull();
  });

  it("defaults vector to none when unspecified", () => {
    expect(readExpectation({ MEMROOS_HOST_ID: "h", EXPECT_GRAPH_BACKEND: "local" }))
      .toEqual({ hostId: "h", graph: "local", vector: "none" });
  });
});

describe("findTopologyViolations", () => {
  const auraHost = { hostId: "oracle-1", graph: "aura" as const, vector: "qdrant-cloud" as const };
  const localHost = { hostId: "cordant", graph: "local" as const, vector: "none" as const };

  it("passes when an aura host resolved aura", () => {
    expect(
      findTopologyViolations(auraHost, { neo4jHttpUrl: AURA, qdrantUrl: QDRANT_CLOUD }),
    ).toEqual([]);
  });

  // The actual oracle-1 outage.
  it("flags an aura host that resolved a local container", () => {
    const v = findTopologyViolations(auraHost, { neo4jHttpUrl: LOCAL_NEO4J, qdrantUrl: QDRANT_CLOUD });
    expect(v).toHaveLength(1);
    expect(v[0].field).toBe("graph");
    expect(v[0].message).toContain("wrong store");
  });

  it("flags an aura host with no neo4j url at all", () => {
    const v = findTopologyViolations(auraHost, { qdrantUrl: QDRANT_CLOUD });
    expect(v.map((x) => x.field)).toContain("graph");
  });

  // Drift must be caught in BOTH directions, or cordant-hermes-01 could
  // silently start writing to shared cloud state.
  it("flags a local host that resolved Aura", () => {
    const v = findTopologyViolations(localHost, { neo4jHttpUrl: AURA });
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("unintentionally");
  });

  it("passes a local host running local neo4j (the cordant case)", () => {
    expect(findTopologyViolations(localHost, { neo4jHttpUrl: LOCAL_NEO4J })).toEqual([]);
  });

  it("flags the placeholder QDRANT_URL that shipped for months", () => {
    const v = findTopologyViolations(auraHost, {
      neo4jHttpUrl: AURA,
      qdrantUrl: "https://your-qdrant-cloud-endpoint",
    });
    expect(v).toHaveLength(1);
    expect(v[0].field).toBe("vector");
  });

  it("flags an unset qdrant url when a vector backend is declared", () => {
    const v = findTopologyViolations(auraHost, { neo4jHttpUrl: AURA });
    expect(v.map((x) => x.field)).toContain("vector");
  });

  it("ignores qdrant entirely when vector backend is none", () => {
    expect(findTopologyViolations(localHost, { neo4jHttpUrl: LOCAL_NEO4J })).toEqual([]);
  });

  it("reports both violations at once", () => {
    expect(
      findTopologyViolations(auraHost, { neo4jHttpUrl: LOCAL_NEO4J, qdrantUrl: "" }),
    ).toHaveLength(2);
  });
});

describe("assertHostTopology", () => {
  it("no-ops for an unmanaged host", () => {
    expect(() => assertHostTopology({}, () => {})).not.toThrow();
  });

  it("no-ops when topology conforms", () => {
    expect(() =>
      assertHostTopology(
        {
          MEMROOS_HOST_ID: "oracle-1",
          EXPECT_GRAPH_BACKEND: "aura",
          EXPECT_VECTOR_BACKEND: "qdrant-cloud",
          NEO4J_HTTP_URL: AURA,
          QDRANT_URL: QDRANT_CLOUD,
        },
        () => {},
      ),
    ).not.toThrow();
  });

  it("THROWS on mismatch — the app must not boot into silent misrouting", () => {
    expect(() =>
      assertHostTopology(
        {
          MEMROOS_HOST_ID: "oracle-1",
          EXPECT_GRAPH_BACKEND: "aura",
          EXPECT_VECTOR_BACKEND: "qdrant-cloud",
          NEO4J_HTTP_URL: LOCAL_NEO4J,
          QDRANT_URL: QDRANT_CLOUD,
        },
        () => {},
      ),
    ).toThrow(/topology mismatch/i);
  });

  it("logs actionable guidance naming the restart wrapper", () => {
    const log = vi.fn();
    try {
      assertHostTopology(
        {
          MEMROOS_HOST_ID: "oracle-1",
          EXPECT_GRAPH_BACKEND: "aura",
          NEO4J_HTTP_URL: LOCAL_NEO4J,
        },
        log,
      );
    } catch {
      /* expected */
    }
    expect(log.mock.calls.flat().join("\n")).toContain("memroos-restart.sh");
  });

  it("honors the explicit escape hatch", () => {
    expect(() =>
      assertHostTopology(
        {
          MEMROOS_HOST_ID: "oracle-1",
          EXPECT_GRAPH_BACKEND: "aura",
          NEO4J_HTTP_URL: LOCAL_NEO4J,
          MEMROOS_ALLOW_TOPOLOGY_MISMATCH: "1",
        },
        () => {},
      ),
    ).not.toThrow();
  });
});

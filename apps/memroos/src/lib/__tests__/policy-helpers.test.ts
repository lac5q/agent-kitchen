import { describe, expect, it } from "vitest";

import {
  nocWindowLabel,
  nocWindowToSinceIso,
  nocWindowToTimeSeriesWindow,
  normalizeNocWindow,
  normalizeNocWorkspace,
} from "@/lib/noc-filters";
import {
  isUnderstandRoutePath,
  toNextHeaders,
  UNDERSTAND_NOINDEX_HEADERS,
} from "@/lib/understand-policy";
import { findSelfDeclaredAccessClaims } from "@/lib/agent-context-policy";

describe("noc-filters", () => {
  it("normalizes window/workspace and maps labels", () => {
    expect(normalizeNocWindow("7d")).toBe("7d");
    expect(normalizeNocWindow("30d")).toBe("30d");
    expect(normalizeNocWindow("nope")).toBe("24h");
    expect(normalizeNocWorkspace("local")).toBe("local");
    expect(normalizeNocWorkspace("remote")).toBe("remote");
    expect(normalizeNocWorkspace(undefined)).toBe("all");
    expect(nocWindowToTimeSeriesWindow("24h")).toBe("day");
    expect(nocWindowToTimeSeriesWindow("7d")).toBe("week");
    expect(nocWindowToTimeSeriesWindow("30d")).toBe("month");
    expect(nocWindowLabel("24h")).toContain("24");
    expect(nocWindowLabel("7d")).toContain("7");
    expect(nocWindowLabel("30d")).toContain("30");
  });

  it("computes since ISO from window", () => {
    const now = Date.parse("2026-07-18T12:00:00.000Z");
    expect(nocWindowToSinceIso("24h", now)).toBe("2026-07-17T12:00:00.000Z");
    expect(nocWindowToSinceIso("7d", now)).toBe("2026-07-11T12:00:00.000Z");
  });
});

describe("understand-policy", () => {
  it("matches understand routes and maps header objects", () => {
    expect(isUnderstandRoutePath("/understand")).toBe(true);
    expect(isUnderstandRoutePath("/understand-static/app.js")).toBe(true);
    expect(isUnderstandRoutePath("/knowledge-graph.json")).toBe(true);
    expect(isUnderstandRoutePath("/wiki")).toBe(false);
    const headers = toNextHeaders(UNDERSTAND_NOINDEX_HEADERS);
    expect(headers.some((h) => h.key === "X-Robots-Tag")).toBe(true);
  });
});

describe("agent-context-policy", () => {
  it("allows message envelope keys and flags nested access claims", () => {
    expect(
      findSelfDeclaredAccessClaims({
        agentId: "luis",
        body: "hello",
        memoryMetadata: { note: "ok" },
      })
    ).toEqual([]);

    expect(
      findSelfDeclaredAccessClaims({
        agentId: "luis",
        body: "hello",
        nested: { access_token: "secret", tenant_id: "t1" },
      })
    ).toEqual(expect.arrayContaining(["nested.access_token", "nested.tenant_id"]));
  });
});

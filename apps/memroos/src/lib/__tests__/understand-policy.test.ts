import { describe, expect, it } from "vitest";

import {
  UNDERSTAND_JSON_ROUTE_PATHS,
  UNDERSTAND_NOINDEX_HEADERS,
  isUnderstandRoutePath,
  toNextHeaders,
} from "../understand-policy";

describe("understand route policy", () => {
  it("identifies the interactive page, static assets, and JSON data routes", () => {
    expect(isUnderstandRoutePath("/understand")).toBe(true);
    expect(isUnderstandRoutePath("/understand-static/app.js")).toBe(true);
    for (const routePath of UNDERSTAND_JSON_ROUTE_PATHS) {
      expect(isUnderstandRoutePath(routePath)).toBe(true);
    }

    expect(isUnderstandRoutePath("/library")).toBe(false);
    expect(isUnderstandRoutePath("/understanding")).toBe(false);
  });

  it("converts noindex policy headers into Next config header pairs", () => {
    expect(UNDERSTAND_NOINDEX_HEADERS["X-Robots-Tag"]).toBe("noindex, nofollow, noarchive");

    const nextHeaders = toNextHeaders({
      "X-Robots-Tag": "noindex",
      "Cache-Control": "no-store",
    });

    expect(nextHeaders).toEqual([
      { key: "X-Robots-Tag", value: "noindex" },
      { key: "Cache-Control", value: "no-store" },
    ]);
  });
});

import { describe, expect, it } from "vitest";

import { BASE_URL, makeCanonical, makeTitle, OG_IMAGE_URL, SITE_NAME } from "../metadata";

describe("metadata helpers", () => {
  it("exposes site constants", () => {
    expect(BASE_URL).toBe("https://memroos.com");
    expect(SITE_NAME).toBe("MemroOS");
    expect(OG_IMAGE_URL).toBe(`${BASE_URL}/screenshots/memroos-og.png`);
  });

  it("builds page titles and canonical URLs", () => {
    expect(makeTitle("Dashboard")).toBe("Dashboard | MemroOS");
    expect(makeCanonical("/pricing")).toBe("https://memroos.com/pricing");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { resolvePublicMemroosUrl } from "@/lib/public-base-url";

describe("resolvePublicMemroosUrl", () => {
  const prev = {
    PUBLIC: process.env.MEMROOS_PUBLIC_BASE_URL,
    APP: process.env.MEMROOS_APP_URL,
    BASE: process.env.MEMROOS_BASE_URL,
  };

  afterEach(() => {
    process.env.MEMROOS_PUBLIC_BASE_URL = prev.PUBLIC;
    process.env.MEMROOS_APP_URL = prev.APP;
    process.env.MEMROOS_BASE_URL = prev.BASE;
  });

  function clearEnv() {
    delete process.env.MEMROOS_PUBLIC_BASE_URL;
    delete process.env.MEMROOS_APP_URL;
    delete process.env.MEMROOS_BASE_URL;
  }

  it("prefers non-localhost MEMROOS_PUBLIC_BASE_URL", () => {
    clearEnv();
    process.env.MEMROOS_PUBLIC_BASE_URL = "https://memroos-cordant.epiloguecapital.com/";
    process.env.MEMROOS_APP_URL = "https://other.example/";
    const req = new Request("http://localhost:3000/api/onboarding/bootstrap");
    expect(resolvePublicMemroosUrl(req)).toBe("https://memroos-cordant.epiloguecapital.com");
  });

  it("skips localhost env in favor of forwarded host", () => {
    clearEnv();
    process.env.MEMROOS_PUBLIC_BASE_URL = "http://localhost:3000";
    const req = new Request("http://127.0.0.1:3000/api/x", {
      headers: {
        "x-forwarded-host": "memroos-cordant.epiloguecapital.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolvePublicMemroosUrl(req)).toBe("https://memroos-cordant.epiloguecapital.com");
  });

  it("uses forwarded host when env unset", () => {
    clearEnv();
    const req = new Request("http://127.0.0.1:3000/api/x", {
      headers: {
        "x-forwarded-host": "memroos-cordant.epiloguecapital.com, other",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolvePublicMemroosUrl(req)).toBe("https://memroos-cordant.epiloguecapital.com");
  });

  it("strips trailing slash from request origin fallback", () => {
    clearEnv();
    const req = new Request("http://example.test:3000/api/x");
    expect(resolvePublicMemroosUrl(req)).toBe("http://example.test:3000");
  });
});

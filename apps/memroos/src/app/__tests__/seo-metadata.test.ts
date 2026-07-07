// @vitest-environment node
import { describe, expect, it } from "vitest";
import robots from "../robots";

describe("public SEO metadata", () => {
  it("keeps robots.txt open for public crawlers with canonical hints", () => {
    const metadata = robots();
    const rules = Array.isArray(metadata.rules) ? metadata.rules : [metadata.rules];
    const userAgents = rules.flatMap((rule) =>
      Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent]
    );

    expect(metadata.host).toBe("memroos.com");
    expect(metadata.sitemap).toBe("https://memroos.com/sitemap.xml");
    expect(userAgents).toEqual(
      expect.arrayContaining([
        "*",
        "Google-Extended",
        "GPTBot",
        "OAI-SearchBot",
        "ChatGPT-User",
        "ClaudeBot",
        "Claude-SearchBot",
        "Claude-User",
        "PerplexityBot",
      ])
    );
    expect(rules[0]).toMatchObject({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/settings/", "/register", "/login", "/invite/"],
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  buildCoworkConnectorSteps,
  buildCoworkDeepLink,
  buildCoworkDeepLinkHint,
  isCordantPublicUrl,
  resolveCoworkMcpUrl,
  resolvePreferredCoworkMcpUrl,
} from "@/lib/cowork-connector";

describe("cowork-connector", () => {
  it("resolves Cordant /mcp URL without trailing slash duplication", () => {
    expect(resolveCoworkMcpUrl("https://memroos-cordant.epiloguecapital.com/")).toBe(
      "https://memroos-cordant.epiloguecapital.com/mcp"
    );
  });

  it("detects Cordant hostname for Team email Cowork step", () => {
    expect(isCordantPublicUrl("https://memroos-cordant.epiloguecapital.com/invite/x")).toBe(true);
    expect(isCordantPublicUrl("https://memroos.epiloguecapital.com/invite/x")).toBe(false);
  });

  it("prefers Cordant MCP URL even when the invite page origin is oracle", () => {
    expect(resolvePreferredCoworkMcpUrl("https://memroos.epiloguecapital.com")).toBe(
      "https://memroos-cordant.epiloguecapital.com/mcp"
    );
  });

  it("member steps never ask the user to paste a bearer token", () => {
    const steps = buildCoworkConnectorSteps("https://memroos-cordant.epiloguecapital.com/mcp");
    expect(steps).toHaveLength(4);
    expect(steps.join("\n")).toContain("https://memroos-cordant.epiloguecapital.com/mcp");
    expect(steps.join("\n").toLowerCase()).not.toMatch(/curl\s*\|?\s*bash/);
    expect(steps.join("\n")).not.toMatch(/Bearer\s*</);
    expect(steps.join("\n").toLowerCase()).toContain("should not need any password or token");
    expect(buildCoworkDeepLink("https://memroos-cordant.epiloguecapital.com/mcp")).toContain(
      "add-custom-connector"
    );
    expect(buildCoworkDeepLinkHint("https://memroos-cordant.epiloguecapital.com/mcp")).toContain(
      "claude.ai"
    );
  });

  it("admin steps keep bearer as admin-only until OAuth ships", () => {
    const steps = buildCoworkConnectorSteps(
      "https://memroos-cordant.epiloguecapital.com/mcp",
      "admin"
    );
    expect(steps.join("\n")).toMatch(/admin only/i);
    expect(steps.join("\n")).toContain("Bearer");
  });
});

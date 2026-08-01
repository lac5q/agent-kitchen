import { describe, expect, it } from "vitest";
import {
  buildCoworkConnectorSteps,
  buildCoworkDeepLinkHint,
  isCordantPublicUrl,
  resolveCoworkMcpUrl,
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

  it("lists numbered connector steps referencing /mcp, not curl|bash", () => {
    const steps = buildCoworkConnectorSteps("https://memroos-cordant.epiloguecapital.com/mcp");
    expect(steps).toHaveLength(4);
    expect(steps.join("\n")).toContain("https://memroos-cordant.epiloguecapital.com/mcp");
    expect(steps.join("\n").toLowerCase()).not.toMatch(/curl\s*\|?\s*bash/);
    expect(buildCoworkDeepLinkHint("https://memroos-cordant.epiloguecapital.com/mcp")).toContain(
      "/mcp"
    );
  });
});

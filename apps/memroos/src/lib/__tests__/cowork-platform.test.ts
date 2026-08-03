// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { PLATFORM_LABELS } from "@/lib/ui-constants";
import { COWORK_PLATFORM_ID } from "@/lib/connectors/cowork-connector";

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

/**
 * Claude Cowork existed as a connector id and a display label, but was missing
 * from the platform union, the registration allowlist, and the console picker —
 * so it rendered nowhere and could not be registered. These assertions keep the
 * four places that must agree from drifting apart again.
 */
describe("Claude Cowork is a first-class platform", () => {
  it("has a display label", () => {
    expect(PLATFORM_LABELS[COWORK_PLATFORM_ID]).toBe("Claude Cowork");
  });

  it("is a member of the AgentPlatform union", () => {
    expect(src("types/index.ts")).toMatch(/\|\s*"cowork"/);
  });

  it("is accepted by /api/agents/register", () => {
    expect(src("app/api/agents/register/route.ts")).toMatch(/"cowork"/);
  });

  it("is offered in the console platform picker", () => {
    expect(src("components/agents/agent-registration-form.tsx")).toMatch(/"cowork"/);
  });

  /**
   * Cowork is a remote MCP connector, not a CLI install. It must stay out of the
   * bootstrap allowlist, which mints curl|bash commands — there is no shell
   * command to give someone for it.
   */
  it("is deliberately absent from the shell bootstrap allowlist", () => {
    const bootstrap = src("app/api/onboarding/bootstrap/route.ts");
    const platformSet = bootstrap.slice(
      bootstrap.indexOf("const PLATFORMS"),
      bootstrap.indexOf("]", bootstrap.indexOf("const PLATFORMS"))
    );
    expect(platformSet).not.toMatch(/"cowork"/);
  });
});

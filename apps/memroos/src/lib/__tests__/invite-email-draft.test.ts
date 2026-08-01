import { describe, expect, it } from "vitest";
import { buildInviteEmailDraft } from "@/lib/invite-email-draft";

describe("buildInviteEmailDraft", () => {
  it("includes invite URL and easy numbered steps without jargon", () => {
    const url = "https://memroos-cordant.epiloguecapital.com/invite/abc123";
    const draft = buildInviteEmailDraft(url);
    expect(draft).toContain(url);
    expect(draft).toContain("1)");
    expect(draft).toContain("2)");
    expect(draft).toContain("3)");
    expect(draft.toLowerCase()).toContain("create your account");
    expect(draft).not.toMatch(/HMAC/i);
    expect(draft).not.toMatch(/SendGrid/i);
    expect(draft).not.toMatch(/\bTTL\b/);
  });

  it("adds Claude Cowork path for Cordant invites without asking members for a bearer", () => {
    const url = "https://memroos-cordant.epiloguecapital.com/invite/abc123";
    const draft = buildInviteEmailDraft(url);
    expect(draft).toMatch(/Claude Cowork/i);
    expect(draft).toContain("https://memroos-cordant.epiloguecapital.com/mcp");
    expect(draft.toLowerCase()).toContain("should not need a token");
    expect(draft).not.toMatch(/Bearer\s+/i);
    expect(draft).not.toMatch(/ask your team admin for the bearer/i);
  });

  it("omits Cordant Cowork block for non-Cordant URLs unless forced", () => {
    const url = "https://memroos.epiloguecapital.com/invite/abc123";
    expect(buildInviteEmailDraft(url)).not.toContain(
      "https://memroos-cordant.epiloguecapital.com/mcp"
    );
    expect(buildInviteEmailDraft(url, { includeCowork: true })).toContain(
      "https://memroos-cordant.epiloguecapital.com/mcp"
    );
  });
});

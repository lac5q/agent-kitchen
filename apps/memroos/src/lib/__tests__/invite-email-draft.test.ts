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
    expect(draft.toLowerCase()).toContain("one-line");
    expect(draft).not.toMatch(/HMAC/i);
    expect(draft).not.toMatch(/SendGrid/i);
    expect(draft).not.toMatch(/\bTTL\b/);
  });
});

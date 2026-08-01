import { describe, expect, it } from "vitest";
import {
  INVITE_EMAIL_SUBJECT,
  buildInviteEmailDraft,
  buildInviteEmailHtml,
} from "@/lib/invite-email-draft";

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

  it("leads the account step with Google and keeps the password path available", () => {
    const draft = buildInviteEmailDraft("https://memroos.epiloguecapital.com/invite/abc123");
    const googleAt = draft.indexOf("Continue with Google");
    const passwordAt = draft.toLowerCase().indexOf("password");
    expect(googleAt).toBeGreaterThan(-1);
    expect(passwordAt).toBeGreaterThan(googleAt);
  });
});

describe("buildInviteEmailHtml", () => {
  const url = "https://memroos.epiloguecapital.com/invite/abc123";

  it("has a subject and links the invite URL exactly once as an anchor", () => {
    expect(INVITE_EMAIL_SUBJECT).toMatch(/invited/i);
    const html = buildInviteEmailHtml(url);
    expect(html).toContain(`<a href="${url}"`);
    expect(html.match(/<a href=/g)).toHaveLength(1);
  });

  it("escapes markup from the URL so a crafted invite cannot inject tags", () => {
    const html = buildInviteEmailHtml("https://example.com/invite/<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("carries the same content as the plain-text draft", () => {
    const html = buildInviteEmailHtml(url);
    expect(html).toMatch(/Continue with Google/);
    expect(html).toMatch(/expires in 72 hours/i);
  });
});

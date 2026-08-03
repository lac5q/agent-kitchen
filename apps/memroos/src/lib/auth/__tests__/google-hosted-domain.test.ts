import { afterEach, describe, expect, it } from "vitest";

import { allowedHostedDomains, isHostedDomainAllowed } from "@/lib/auth/google-oidc";

const ORIGINAL = process.env.GOOGLE_ALLOWED_HOSTED_DOMAINS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.GOOGLE_ALLOWED_HOSTED_DOMAINS;
  else process.env.GOOGLE_ALLOWED_HOSTED_DOMAINS = ORIGINAL;
});

describe("Workspace domain allowlist", () => {
  it("permits everything when unset — the posture both hosts run today", () => {
    delete process.env.GOOGLE_ALLOWED_HOSTED_DOMAINS;
    expect(allowedHostedDomains()).toEqual([]);
    expect(isHostedDomainAllowed(null)).toBe(true);
    expect(isHostedDomainAllowed("anyone.com")).toBe(true);
  });

  it("parses a comma-separated list, trimming and lowercasing", () => {
    process.env.GOOGLE_ALLOWED_HOSTED_DOMAINS = " Cordant.ai , epiloguecapital.com ,, ";
    expect(allowedHostedDomains()).toEqual(["cordant.ai", "epiloguecapital.com"]);
  });

  it("admits a listed domain and refuses an unlisted one", () => {
    const allowed = ["cordant.ai"];
    expect(isHostedDomainAllowed("cordant.ai", allowed)).toBe(true);
    expect(isHostedDomainAllowed("evil.com", allowed)).toBe(false);
  });

  /**
   * The trap: a consumer Google account carries no `hd` claim. Treating a
   * missing domain as "unrestricted" would let any gmail address through an
   * allowlist meant to admit only staff.
   */
  it("refuses an account with no hosted domain once an allowlist exists", () => {
    expect(isHostedDomainAllowed(null, ["cordant.ai"])).toBe(false);
  });
});

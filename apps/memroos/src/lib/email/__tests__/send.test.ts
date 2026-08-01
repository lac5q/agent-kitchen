import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSendGridPayload,
  getEmailConfig,
  isEmailDryRun,
  isValidEmailAddress,
  sendEmail,
} from "@/lib/email/send";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.SENDGRID_API_KEY = "sg-test-key";
  process.env.MEMROOS_EMAIL_FROM = "memroos@epiloguecapital.com";
  delete process.env.MEMROOS_EMAIL_DRY_RUN;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("getEmailConfig", () => {
  it("returns null when either half of the credential pair is missing", () => {
    delete process.env.SENDGRID_API_KEY;
    expect(getEmailConfig()).toBeNull();

    process.env.SENDGRID_API_KEY = "sg-test-key";
    delete process.env.MEMROOS_EMAIL_FROM;
    expect(getEmailConfig()).toBeNull();
  });

  it("treats a whitespace-only value as unset rather than a usable sender", () => {
    process.env.MEMROOS_EMAIL_FROM = "   ";
    expect(getEmailConfig()).toBeNull();
  });
});

describe("isValidEmailAddress", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmailAddress("luis@epiloguecapital.com")).toBe(true);
    expect(isValidEmailAddress("first.last+tag@sub.example.co.uk")).toBe(true);
  });

  it("rejects addresses that would be silently dropped downstream", () => {
    expect(isValidEmailAddress("")).toBe(false);
    expect(isValidEmailAddress("nobody")).toBe(false);
    expect(isValidEmailAddress("no@tld")).toBe(false);
    expect(isValidEmailAddress("two@@example.com")).toBe(false);
    expect(isValidEmailAddress("has space@example.com")).toBe(false);
    expect(isValidEmailAddress(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});

describe("buildSendGridPayload", () => {
  it("puts text/plain first so clients without HTML still render", () => {
    const payload = buildSendGridPayload(
      { apiKey: "k", from: "from@example.com" },
      { to: "to@example.com", subject: "Subject", text: "plain", html: "<p>rich</p>" }
    );
    expect(payload.content[0].type).toBe("text/plain");
    expect(payload.content[1].type).toBe("text/html");
    expect(payload.personalizations[0].to[0].email).toBe("to@example.com");
    expect(payload.from.email).toBe("from@example.com");
  });

  it("omits the HTML part entirely when none is supplied", () => {
    const payload = buildSendGridPayload(
      { apiKey: "k", from: "from@example.com" },
      { to: "to@example.com", subject: "Subject", text: "plain" }
    );
    expect(payload.content).toHaveLength(1);
  });
});

describe("sendEmail", () => {
  const message = {
    to: "invitee@example.com",
    subject: "You're invited to MemRoOS",
    text: "https://memroos.example.com/invite/secret-token",
  };

  it("posts to SendGrid and reports sent on 2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail(message)).resolves.toEqual({ status: "sent" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sg-test-key");
  });

  it("reports not_configured without calling the network", async () => {
    delete process.env.SENDGRID_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail(message)).resolves.toEqual({ status: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds but does not send under MEMROOS_EMAIL_DRY_RUN", async () => {
    process.env.MEMROOS_EMAIL_DRY_RUN = "1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail(message)).resolves.toEqual({ status: "dry_run" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isEmailDryRun()).toBe(true);
  });

  it("rejects a bad recipient before spending a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail({ ...message, to: "not-an-address" });
    expect(result).toEqual({ status: "error", reason: "invalid recipient address" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never leaks the invite URL into the error reason on a SendGrid rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: [{ message: message.text }] }), { status: 400 })
      )
    );

    const result = await sendEmail(message);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.reason).toBe("sendgrid responded 400");
      expect(result.reason).not.toContain("secret-token");
    }
  });

  it("surfaces a transport failure as an error rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await sendEmail(message);
    expect(result).toEqual({ status: "error", reason: "network down" });
  });
});

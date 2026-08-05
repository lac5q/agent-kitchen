import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "@/lib/db-schema";
import {
  recordOnboardingBaseUrlFallback,
  resolvePublicMemroosUrl,
  resolvePublicMemroosUrlDetailed,
} from "@/lib/http/public-base-url";

describe("resolvePublicMemroosUrl", () => {
  const prev = {
    PUBLIC: process.env.MEMROOS_PUBLIC_BASE_URL,
    APP: process.env.MEMROOS_APP_URL,
    BASE: process.env.MEMROOS_BASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  };

  function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  afterEach(() => {
    restoreEnv("MEMROOS_PUBLIC_BASE_URL", prev.PUBLIC);
    restoreEnv("MEMROOS_APP_URL", prev.APP);
    restoreEnv("MEMROOS_BASE_URL", prev.BASE);
    restoreEnv("NODE_ENV", prev.NODE_ENV);
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
    expect(resolvePublicMemroosUrlDetailed(req).source).toBe("env");
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
    expect(resolvePublicMemroosUrlDetailed(req).source).toBe("forwarded-host");
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
    expect(resolvePublicMemroosUrlDetailed(req).source).toBe("request-origin");
  });

  it("records a production fallback host for NOC attention and skips configured URLs", () => {
    clearEnv();
    process.env.NODE_ENV = "production";
    const db = new Database(":memory:");
    initSchema(db);
    const fallback = resolvePublicMemroosUrlDetailed(
      new Request("http://127.0.0.1:3000/api/x", {
        headers: { "x-forwarded-host": "memroos-cordant.epiloguecapital.com", "x-forwarded-proto": "https" },
      })
    );

    recordOnboardingBaseUrlFallback(fallback, db);
    const row = db
      .prepare(
        "SELECT event_type, entity_type, metadata_json FROM audit_entries WHERE event_type = ?"
      )
      .get("onboarding.base_url_fallback") as {
      event_type: string;
      entity_type: string;
      metadata_json: string;
    };
    expect(row.event_type).toBe("onboarding.base_url_fallback");
    expect(row.entity_type).toBe("onboarding");
    expect(JSON.parse(row.metadata_json)).toMatchObject({
      source: "forwarded-host",
      fallback_host: "memroos-cordant.epiloguecapital.com",
    });

    process.env.MEMROOS_PUBLIC_BASE_URL = "https://memroos.example.test";
    const before = db
      .prepare("SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = ?")
      .get("onboarding.base_url_fallback") as { count: number };
    recordOnboardingBaseUrlFallback(resolvePublicMemroosUrlDetailed(new Request("http://localhost/api/x")), db);
    const after = db
      .prepare("SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = ?")
      .get("onboarding.base_url_fallback") as { count: number };
    expect(after.count).toBe(before.count);
    db.close();
  });
});

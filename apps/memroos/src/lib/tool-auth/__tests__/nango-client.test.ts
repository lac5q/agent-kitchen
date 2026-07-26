// apps/memroos/src/lib/tool-auth/__tests__/nango-client.test.ts
// Phase 179 / v8.23 — nango client wrapper unit tests.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ToolAuthConfigError,
  ToolAuthUpstreamError,
  createNangoConnectSession,
  deleteNangoConnection,
  getNangoUsage,
  listNangoConnections,
} from "../nango-client";

const originalFetch = global.fetch;

beforeEach(() => {
  process.env.NANGO_SECRET_KEY = "test-secret-key";
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.NANGO_SECRET_KEY;
  vi.restoreAllMocks();
});

describe("nango-client: config errors", () => {
  it("throws ToolAuthConfigError when NANGO_SECRET_KEY is unset", async () => {
    delete process.env.NANGO_SECRET_KEY;
    await expect(listNangoConnections()).rejects.toBeInstanceOf(ToolAuthConfigError);
    await expect(getNangoUsage()).rejects.toBeInstanceOf(ToolAuthConfigError);
  });
});

describe("nango-client: listNangoConnections", () => {
  it("maps Nango records into ToolConnection shape", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          connections: [
            {
              id: 12345,
              provider_config_key: "slack",
              connection_id: "conn-1",
              created_at: "2026-07-23T08:00:00.000Z",
              updated_at: "2026-07-23T08:00:00.000Z",
              end_user: { email: "ops@example.com" },
            },
          ],
        }),
    });

    const result = await listNangoConnections();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      providerKey: "slack",
      connectionId: "12345",
      status: "connected",
      accountEmail: "ops@example.com",
      authMode: "oauth",
    });
  });

  it("throws ToolAuthUpstreamError on 5xx", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => "Bad Gateway",
    });
    await expect(listNangoConnections()).rejects.toBeInstanceOf(ToolAuthUpstreamError);
  });
});

describe("nango-client: createNangoConnectSession", () => {
  it("posts the session request with allowed integrations", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: { token: "tok_abc", connect_link: "https://connect.nango.dev/?session_token=tok_abc", expires_at: "2026-07-23T09:00:00Z" },
        }),
    });

    const result = await createNangoConnectSession({
      endUserEmail: "ops@example.com",
      allowedIntegrationIds: ["slack"],
    });
    expect(result.sessionToken).toBe("tok_abc");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/connect/sessions"),
      expect.objectContaining({ method: "POST" }),
    );
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.allowed_integrations).toEqual(["slack"]);
    expect(body.end_user.email).toBe("ops@example.com");
    // Nango rejects sessions without end_user.id (400 invalid_body, verified
    // live 2026-07-26). The email doubles as the id.
    expect(body.end_user.id).toBe("ops@example.com");
  });

  // Nango's response field is `token`, not `session_token`. Reading the wrong
  // name returned undefined, the popup opened at `?session_token=undefined`,
  // and Nango showed "Your session has expired, please refresh the modal".
  it("reads the session token from data.token and surfaces connect_link", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: {
            token: "nango_connect_session_real",
            connect_link: "https://connect.nango.dev/?session_token=nango_connect_session_real",
            expires_at: "2026-07-23T09:00:00Z",
          },
        }),
    });
    const result = await createNangoConnectSession({
      endUserEmail: "ops@example.com",
      allowedIntegrationIds: ["notion"],
    });
    expect(result.sessionToken).toBe("nango_connect_session_real");
    expect(result.sessionToken).toBeDefined();
    expect(result.connectLink).toContain("session_token=nango_connect_session_real");
  });

  // JWT sessions resolve email to '' (not null), which slipped past the
  // earlier `?? fallback` and produced a live 400 on cordant-hermes-01:
  // "expected string to have >=1 characters" + "Invalid email address".
  it.each([["", "empty string"], ["   ", "whitespace"], ["not-an-email", "malformed"]])(
    "uses the fallback id and omits email when the session email is %j (%s)",
    async (email) => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: { token: "tok_e", expires_at: "2026-07-23T09:00:00Z" },
          }),
      });
      await createNangoConnectSession({
        endUserEmail: email,
        allowedIntegrationIds: ["circleback-mcp"],
      });
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.end_user.id).toBe("memroos-operator");
      expect(body.end_user.email).toBeUndefined();
    },
  );

  it("falls back to a fixed end_user.id when no session email exists", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: { token: "tok_x", expires_at: "2026-07-23T09:00:00Z" },
        }),
    });
    await createNangoConnectSession({
      endUserEmail: null,
      allowedIntegrationIds: ["notion"],
    });
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.end_user.id).toBe("memroos-operator");
    expect(body.end_user.email).toBeUndefined();
  });
});

describe("nango-client: deleteNangoConnection", () => {
  it("treats 404 as success", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "not found",
    });
    await expect(deleteNangoConnection("missing-id")).resolves.toBeUndefined();
  });

  it("rethrows non-404 upstream errors", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "boom",
    });
    await expect(deleteNangoConnection("any")).rejects.toBeInstanceOf(ToolAuthUpstreamError);
  });
});

describe("nango-client: getNangoUsage", () => {
  it("returns a permissive sentinel on upstream error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => "Bad Gateway",
    });
    const usage = await getNangoUsage();
    expect(usage.used).toBe(0);
    expect(usage.limit).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("classifies plan tier from connection limit", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({ data: { connections: { current: 8, limit: 10 } } }),
    });
    const usage = await getNangoUsage();
    expect(usage).toEqual({ used: 8, limit: 10, plan: "free" });
  });
});
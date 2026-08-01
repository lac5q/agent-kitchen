// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callRest, callTool, initialize } from "../mcp-client";

function mockFetchResponse(
  body: string | (() => Promise<string>),
  ok = true,
  status = 200,
) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: typeof body === "function" ? body : async () => body,
    json: async () => JSON.parse(typeof body === "function" ? await body() : body),
  });
}

describe("mcp-client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initialize / rpc", () => {
    it("succeeds on SSE data: line with result", async () => {
      global.fetch = mockFetchResponse(
        'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}\n',
      ) as unknown as typeof fetch;

      await expect(initialize("https://mcp.example/rpc", "tok")).resolves.toBeUndefined();

      const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("https://mcp.example/rpc");
      expect((init as RequestInit).method).toBe("POST");
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: "Bearer tok",
        "Content-Type": "application/json",
      });
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.method).toBe("initialize");
    });

    it("succeeds on plain JSON result (non-SSE)", async () => {
      global.fetch = mockFetchResponse(
        '{"jsonrpc":"2.0","id":1,"result":{"capabilities":{}}}',
      ) as unknown as typeof fetch;

      await expect(initialize("https://mcp.example/rpc", "tok")).resolves.toBeUndefined();
    });

    it("throws McpError on HTTP error", async () => {
      global.fetch = mockFetchResponse("", false, 503) as unknown as typeof fetch;

      let caught: unknown;
      try {
        await initialize("https://mcp.example/rpc", "tok");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).name).toBe("McpError");
      expect((caught as Error).message).toBe(
        "MCP https://mcp.example/rpc returned HTTP 503",
      );
    });

    it("throws McpError on MCP error object in SSE", async () => {
      global.fetch = mockFetchResponse(
        'data: {"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"bad request"}}\n',
      ) as unknown as typeof fetch;

      let caught: unknown;
      try {
        await initialize("https://mcp.example/rpc", "tok");
      } catch (err) {
        caught = err;
      }
      expect((caught as Error).message).toBe("bad request");
    });

    it("throws McpError when MCP error has no message", async () => {
      global.fetch = mockFetchResponse(
        'data: {"jsonrpc":"2.0","id":1,"error":{"code":-32600}}\n',
      ) as unknown as typeof fetch;

      let caught: unknown;
      try {
        await initialize("https://mcp.example/rpc", "tok");
      } catch (err) {
        caught = err;
      }
      expect((caught as Error).message).toBe("MCP returned an error");
    });

    it("throws McpError when response has no parseable result", async () => {
      global.fetch = mockFetchResponse("not json at all\nalso not json") as unknown as typeof fetch;

      let caught: unknown;
      try {
        await initialize("https://mcp.example/rpc", "tok");
      } catch (err) {
        caught = err;
      }
      expect((caught as Error).message).toContain("returned no parseable result");
    });
  });

  describe("callTool", () => {
    it("returns decoded JSON payload from text content block", async () => {
      global.fetch = mockFetchResponse(
        'data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"issues\\":[1,2]}"}]}}\n',
      ) as unknown as typeof fetch;

      const result = await callTool("https://mcp.example/rpc", "tok", "list_issues", {
        limit: 10,
      });

      expect(result.payload).toEqual({ issues: [1, 2] });
    });

    it("throws McpError when tool result has no text content", async () => {
      global.fetch = mockFetchResponse(
        'data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"image"}]}}\n',
      ) as unknown as typeof fetch;

      let caught: unknown;
      try {
        await callTool("https://mcp.example/rpc", "tok", "list_issues", {});
      } catch (err) {
        caught = err;
      }
      expect((caught as Error).message).toBe("MCP tool list_issues returned no text content");
    });

    it("throws McpError when text block is empty", async () => {
      global.fetch = mockFetchResponse(
        'data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text"}]}}\n',
      ) as unknown as typeof fetch;

      let caught: unknown;
      try {
        await callTool("https://mcp.example/rpc", "tok", "list_issues", {});
      } catch (err) {
        caught = err;
      }
      expect((caught as Error).message).toBe("MCP tool list_issues returned no text content");
    });
  });

  describe("callRest", () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      }) as unknown as typeof fetch;
    });

    it("throws McpError on REST HTTP error", async () => {
      global.fetch = mockFetchResponse("", false, 401) as unknown as typeof fetch;

      let caught: unknown;
      try {
        await callRest("https://api.example.com", "tok", { method: "GET", path: "/v1/items" });
      } catch (err) {
        caught = err;
      }
      expect((caught as Error).message).toBe("REST /v1/items returned HTTP 401");
    });

    it("serializes object values in GET query and skips null/undefined", async () => {
      await callRest("https://api.example.com", "tok", {
        method: "GET",
        path: "/v1/search",
        body: {
          filter: { status: "open" },
          pageSize: 25,
          skipMe: null,
          alsoSkip: undefined,
          tag: "urgent",
        },
      });

      const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("filter")).toBe('{"status":"open"}');
      expect(parsed.searchParams.get("pageSize")).toBe("25");
      expect(parsed.searchParams.get("tag")).toBe("urgent");
      expect(parsed.searchParams.has("skipMe")).toBe(false);
      expect(parsed.searchParams.has("alsoSkip")).toBe(false);
      expect((init as RequestInit).body).toBeUndefined();
    });

    it("appends query params with & when path already has a query string", async () => {
      await callRest("https://api.example.com", "tok", {
        method: "GET",
        path: "/v1/items?existing=1",
        body: { pageSize: 10 },
      });

      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("https://api.example.com/v1/items?existing=1&pageSize=10");
    });

    it("returns parsed JSON payload on success", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ files: ["a.md"] }),
      }) as unknown as typeof fetch;

      const result = await callRest("https://api.example.com", "tok", {
        method: "POST",
        path: "/v1/files",
        body: { name: "a.md" },
      });

      expect(result.payload).toEqual({ files: ["a.md"] });
    });
  });
});

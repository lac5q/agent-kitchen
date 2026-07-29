// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_KEY = process.env.NANGO_SECRET_KEY;

async function loadClient() {
  vi.resetModules();
  return import("../nango-client");
}

function mockJson(payload: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    text: async () => JSON.stringify(payload),
  }) as unknown as typeof fetch;
}

describe("listNangoIntegrationKeys", () => {
  beforeEach(() => {
    process.env.NANGO_SECRET_KEY = "test-key";
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.NANGO_SECRET_KEY;
    else process.env.NANGO_SECRET_KEY = ORIGINAL_KEY;
    vi.restoreAllMocks();
  });

  it("returns the set of configured integration keys", async () => {
    mockJson({
      data: [
        { unique_key: "google-drive" },
        { unique_key: "google-mail" },
        { unique_key: "notion" },
      ],
    });
    const { listNangoIntegrationKeys } = await loadClient();
    const keys = await listNangoIntegrationKeys();
    expect(keys).not.toBeNull();
    expect(keys!.has("google-mail")).toBe(true);
    expect(keys!.has("slack-mcp")).toBe(false);
  });

  it("accepts the legacy `configs` shape as well as `data`", async () => {
    mockJson({ configs: [{ uniqueKey: "linear-mcp" }] });
    const { listNangoIntegrationKeys } = await loadClient();
    const keys = await listNangoIntegrationKeys();
    expect(keys!.has("linear-mcp")).toBe(true);
  });

  it("returns null when Nango is unreachable, so callers fail OPEN", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const { listNangoIntegrationKeys } = await loadClient();
    // Null, not an empty set: an empty set would mark every provider
    // unavailable and blank the integrations page on a transient blip.
    await expect(listNangoIntegrationKeys()).resolves.toBeNull();
  });

  it("treats an empty list as unknown rather than 'nothing is configured'", async () => {
    mockJson({ data: [] });
    const { listNangoIntegrationKeys } = await loadClient();
    await expect(listNangoIntegrationKeys()).resolves.toBeNull();
  });

  it("returns null rather than throwing when NANGO_SECRET_KEY is unset", async () => {
    delete process.env.NANGO_SECRET_KEY;
    mockJson({ data: [{ unique_key: "notion" }] });
    const { listNangoIntegrationKeys } = await loadClient();
    await expect(listNangoIntegrationKeys()).resolves.toBeNull();
  });
});

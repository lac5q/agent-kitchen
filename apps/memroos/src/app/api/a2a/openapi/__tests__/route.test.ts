// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  A2A_CONTRACT_HEADER,
  A2A_CONTRACT_ID,
} from "@/lib/a2a/contract";
import {
  A2A_CANONICAL_AGENT_CARD_PATH,
  A2A_COMPAT_AGENT_CARD_PATH,
} from "@/lib/a2a/types";

const { GET } = await import("../route");

describe("GET /api/a2a/openapi", () => {
  it("serves the A2A OpenAPI contract without auth", async () => {
    const response = await GET(new Request("https://memroos.example/api/a2a/openapi"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get(A2A_CONTRACT_HEADER)).toBe(A2A_CONTRACT_ID);
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.version).toBe(A2A_CONTRACT_ID);
    expect(body["x-memroos-contract"]).toBe(A2A_CONTRACT_ID);
    expect(body.servers).toEqual([{ url: "https://memroos.example" }]);
    expect(body.paths[A2A_CANONICAL_AGENT_CARD_PATH].get.operationId).toBe("getA2aAgentCard");
    expect(body.paths[A2A_COMPAT_AGENT_CARD_PATH].get.operationId).toBe("getA2aAgentCardAlias");
    expect(body.paths["/api/a2a"].post.operationId).toBe("dispatchA2aJsonRpc");
  });

  it("uses the explicit A2A contract base URL and ignores forwarded host headers", async () => {
    process.env.MEMROOS_A2A_OPENAPI_BASE_URL = "https://a2a.memroos.test/";

    const response = await GET(
      new Request("https://localhost:3002/api/a2a/openapi", {
        headers: {
          "x-forwarded-host": "poisoned.example",
          "x-forwarded-proto": "https",
        },
      })
    );
    const body = await response.json();

    expect(body.servers).toEqual([{ url: "https://a2a.memroos.test" }]);
    delete process.env.MEMROOS_A2A_OPENAPI_BASE_URL;
  });
});

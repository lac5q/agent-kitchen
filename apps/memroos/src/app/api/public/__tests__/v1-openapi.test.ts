// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  PUBLIC_EVAL_API_V1_CONTRACT_ID,
  PUBLIC_EVAL_CONTRACT_HEADER,
  publicEvalApiV1Contract,
} from "@/lib/public-api/eval-contract";

const { GET } = await import("../v1/openapi/route");

describe("GET /api/public/v1/openapi", () => {
  it("serves the public eval v1 OpenAPI contract without auth", async () => {
    const response = await GET(new Request("https://memroos.example/api/public/v1/openapi"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.version).toBe(PUBLIC_EVAL_API_V1_CONTRACT_ID);
    expect(body["x-memroos-contract"]).toBe(PUBLIC_EVAL_API_V1_CONTRACT_ID);
    expect(body.servers).toEqual([{ url: "https://memroos.example" }]);
    expect(body.components.securitySchemes.TenantBearerAuth.scheme).toBe("bearer");
    expect(body.components.schemas.AgentEvalTrace.required).toEqual([
      "traceId",
      "agentId",
      "input",
      "output",
    ]);
  });

  it("keeps OpenAPI paths aligned with the shared public eval contract table", async () => {
    const response = await GET(new Request("https://memroos.example/api/public/v1/openapi"));
    const body = await response.json();
    const routes = publicEvalApiV1Contract.routes;

    expect(body.paths[routes.submitTrace.path].post.operationId).toBe("submitEvalTrace");
    expect(body.paths[routes.getRun.path].get.operationId).toBe("getEvalRun");
    expect(body.paths[routes.listProposals.path].get.operationId).toBe("listEvalProposals");
    expect(body.paths[routes.submitTrace.path].post.responses["200"].headers).toHaveProperty(
      PUBLIC_EVAL_CONTRACT_HEADER
    );
  });

  it("uses the explicit public base URL and ignores forwarded host headers", async () => {
    process.env.MEMROOS_PUBLIC_EVAL_OPENAPI_BASE_URL = "https://public.memroos.test/";

    const response = await GET(
      new Request("https://localhost:3002/api/public/v1/openapi", {
        headers: {
          "x-forwarded-host": "poisoned.example",
          "x-forwarded-proto": "https",
        },
      })
    );
    const body = await response.json();

    expect(body.servers).toEqual([{ url: "https://public.memroos.test" }]);
    delete process.env.MEMROOS_PUBLIC_EVAL_OPENAPI_BASE_URL;
  });
});

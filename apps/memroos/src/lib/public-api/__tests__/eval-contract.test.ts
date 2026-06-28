import { describe, expect, it } from "vitest";

import {
  buildPublicEvalOpenApiDocument,
  isAgentEvalTrace,
  parseAgentEvalTrace,
  parseEvalSubmitResult,
  publicEvalApiV1Contract,
  publicEvalContractHeaders,
  PUBLIC_EVAL_API_V1_CONTRACT_ID,
  PUBLIC_EVAL_CONTRACT_HEADER,
} from "../eval-contract";

describe("public eval API v1 contract", () => {
  it("accepts the minimal AgentEvalTrace shape used by the public route", () => {
    const payload = {
      traceId: "trace-contract-001",
      agentId: "codex",
      input: "Summarize the work",
      output: "The work is summarized.",
    };

    expect(isAgentEvalTrace(payload)).toBe(true);
    expect(parseAgentEvalTrace(payload)).toMatchObject(payload);
  });

  it("rejects malformed AgentEvalTrace payloads before scoring", () => {
    expect(isAgentEvalTrace({ traceId: "missing-agent", input: "", output: "" })).toBe(false);
    expect(() => parseAgentEvalTrace({ traceId: "", agentId: "codex", input: "", output: "" })).toThrow();
  });

  it("validates the EvalSubmitResult response shape used by the SDK", () => {
    const result = parseEvalSubmitResult({
      runId: "run-contract-001",
      w: 0.82,
      layers: {
        l1: { score: 1, weight: 0.25, scorers: [] },
        l2: { score: 0.8, weight: 0.5, scorers: [] },
        l3: { score: 0.6, weight: 0.25, scorers: [] },
      },
      proposalIds: [],
      tenantId: "tenant-alpha",
    });

    expect(result.runId).toBe("run-contract-001");
    expect(() => parseEvalSubmitResult({ runId: "run", w: "0.82", layers: {}, proposalIds: [], tenantId: "t" })).toThrow();
  });

  it("exposes a stable contract identifier for clients and smoke tests", () => {
    expect(publicEvalApiV1Contract.id).toBe(PUBLIC_EVAL_API_V1_CONTRACT_ID);
    expect(publicEvalApiV1Contract.routes.submitTrace.path).toBe("/api/public/v1/traces");
    expect(publicEvalContractHeaders()[PUBLIC_EVAL_CONTRACT_HEADER]).toBe(PUBLIC_EVAL_API_V1_CONTRACT_ID);
  });

  it("builds an OpenAPI document from the shared route contract", () => {
    const doc = buildPublicEvalOpenApiDocument("https://memroos.example/");
    const routes = publicEvalApiV1Contract.routes;

    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers).toEqual([{ url: "https://memroos.example" }]);
    expect(doc.paths[routes.submitTrace.path].post.responses["200"].headers).toHaveProperty(
      PUBLIC_EVAL_CONTRACT_HEADER
    );
    expect(doc.paths[routes.getRun.path].get.parameters[0]).toMatchObject({
      name: "runId",
      in: "path",
      required: true,
    });
    expect(doc.paths[routes.listProposals.path].get.parameters[0]).toMatchObject({
      name: "traceId",
      in: "query",
      required: false,
    });
  });
});

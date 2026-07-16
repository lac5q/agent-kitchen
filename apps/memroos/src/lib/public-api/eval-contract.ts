import { z } from "zod";

import type { AgentEvalTrace, EvalLayerBreakdown } from "@/lib/evals/types";

export const PUBLIC_EVAL_API_V1_CONTRACT_ID = "public-eval-api.v1";
export const PUBLIC_EVAL_CONTRACT_HEADER = "X-Memroos-Contract";

const scorerResultSchema = z
  .object({
    scorerId: z.string().min(1),
    layer: z.enum(["l1", "l2", "l3"]),
    score: z.number(),
    detail: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const layerBreakdownSchema = z
  .object({
    score: z.number(),
    weight: z.number(),
    scorers: z.array(scorerResultSchema),
  })
  .passthrough();

const agentEvalTraceSchema = z
  .object({
    traceId: z.string().min(1),
    agentId: z.string().min(1),
    agentModelProvider: z.string().optional(),
    agentModel: z.string().optional(),
    agentModelFamily: z.string().optional(),
    role: z.string().optional(),
    input: z.string(),
    output: z.string(),
    expectedFacts: z.array(z.string()).optional(),
    toolCalls: z
      .array(
        z
          .object({
            name: z.string().min(1),
            valid: z.boolean().optional(),
            schemaValid: z.boolean().optional(),
          })
          .passthrough()
      )
      .optional(),
    memory: z
      .object({
        expectedFacts: z.array(z.string()).optional(),
        retrievedFacts: z.array(z.string()).optional(),
        recallAtK: z.number().optional(),
        precisionAtK: z.number().optional(),
        mrr: z.number().optional(),
      })
      .passthrough()
      .optional(),
    outcome: z
      .object({
        completed: z.boolean().optional(),
        escalated: z.boolean().optional(),
        ttrMs: z.number().optional(),
        operatorApproved: z.boolean().optional(),
        costUsd: z.number().optional(),
      })
      .passthrough()
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const evalSubmitResultSchema = z
  .object({
    runId: z.string().min(1),
    w: z.number(),
    layers: z.record(z.string(), layerBreakdownSchema),
    proposalIds: z.array(z.string()),
    tenantId: z.string().min(1),
  })
  .passthrough();

export const publicEvalApiV1Contract = {
  id: PUBLIC_EVAL_API_V1_CONTRACT_ID,
  routes: {
    submitTrace: {
      method: "POST",
      path: "/api/public/v1/traces",
      request: "AgentEvalTrace | OpenInferenceTrace",
      response: "EvalSubmitResult",
    },
    getRun: {
      method: "GET",
      path: "/api/public/v1/runs/{runId}",
      response: "{ run: EvalRunResult }",
    },
    listProposals: {
      method: "GET",
      path: "/api/public/v1/proposals",
      response: "{ proposals: SealProposal[] }",
    },
  },
} as const;

const jsonObjectSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const errorResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    error: { type: "string" },
  },
  required: ["error"],
} as const;

export const publicEvalApiV1OpenApiSchemas = {
  AgentEvalTrace: {
    type: "object",
    additionalProperties: true,
    properties: {
      traceId: { type: "string", minLength: 1 },
      agentId: { type: "string", minLength: 1 },
      agentModelProvider: { type: "string" },
      agentModel: { type: "string" },
      agentModelFamily: { type: "string" },
      role: { type: "string" },
      input: { type: "string" },
      output: { type: "string" },
      expectedFacts: { type: "array", items: { type: "string" } },
      toolCalls: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            name: { type: "string", minLength: 1 },
            valid: { type: "boolean" },
            schemaValid: { type: "boolean" },
          },
          required: ["name"],
        },
      },
      memory: {
        type: "object",
        additionalProperties: true,
        properties: {
          expectedFacts: { type: "array", items: { type: "string" } },
          retrievedFacts: { type: "array", items: { type: "string" } },
          recallAtK: { type: "number" },
          precisionAtK: { type: "number" },
          mrr: { type: "number" },
        },
      },
      outcome: {
        type: "object",
        additionalProperties: true,
        properties: {
          completed: { type: "boolean" },
          escalated: { type: "boolean" },
          ttrMs: { type: "number" },
          operatorApproved: { type: "boolean" },
          costUsd: { type: "number" },
        },
      },
      metadata: jsonObjectSchema,
    },
    required: ["traceId", "agentId", "input", "output"],
  },
  OpenInferenceTrace: {
    type: "object",
    additionalProperties: true,
    properties: {
      "openinference.span.kind": { type: "string", minLength: 1 },
      "input.value": { type: "string" },
      "output.value": { type: "string" },
      "llm.model_name": { type: "string" },
      "session.id": { type: "string" },
      "trace.id": { type: "string" },
      "metadata.agent_id": { type: "string" },
      "llm.token_count.total": { type: "number" },
    },
    required: ["openinference.span.kind"],
  },
  EvalScorerResult: {
    type: "object",
    additionalProperties: true,
    properties: {
      scorerId: { type: "string" },
      layer: { type: "string", enum: ["l1", "l2", "l3"] },
      score: { type: "number" },
      detail: { type: "string" },
      metadata: jsonObjectSchema,
    },
    required: ["scorerId", "layer", "score", "detail"],
  },
  EvalLayerBreakdown: {
    type: "object",
    additionalProperties: true,
    properties: {
      score: { type: "number" },
      weight: { type: "number" },
      scorers: {
        type: "array",
        items: { $ref: "#/components/schemas/EvalScorerResult" },
      },
    },
    required: ["score", "weight", "scorers"],
  },
  EvalSubmitResult: {
    type: "object",
    additionalProperties: true,
    properties: {
      runId: { type: "string", minLength: 1 },
      w: { type: "number" },
      layers: {
        type: "object",
        additionalProperties: { $ref: "#/components/schemas/EvalLayerBreakdown" },
      },
      proposalIds: { type: "array", items: { type: "string" } },
      tenantId: { type: "string", minLength: 1 },
    },
    required: ["runId", "w", "layers", "proposalIds", "tenantId"],
  },
  EvalRunResult: {
    type: "object",
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      traceId: { type: "string" },
      agentId: { type: "string" },
      role: { type: "string" },
      compositeW: { type: "number" },
      trusted: { type: "boolean" },
      layers: {
        type: "object",
        additionalProperties: { $ref: "#/components/schemas/EvalLayerBreakdown" },
      },
      scorerResults: {
        type: "array",
        items: { $ref: "#/components/schemas/EvalScorerResult" },
      },
      startedAt: { type: "string" },
      completedAt: { type: "string" },
    },
    required: ["id", "traceId", "agentId", "compositeW", "layers"],
  },
  SealProposal: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      proposalType: { type: "string" },
      status: { type: "string" },
      forecastWDelta: { type: "number" },
      createdAt: { type: "string" },
    },
    required: ["id", "proposalType", "status", "forecastWDelta", "createdAt"],
  },
  GetRunResponse: {
    type: "object",
    additionalProperties: false,
    properties: {
      run: { $ref: "#/components/schemas/EvalRunResult" },
    },
    required: ["run"],
  },
  ListProposalsResponse: {
    type: "object",
    additionalProperties: false,
    properties: {
      proposals: {
        type: "array",
        items: { $ref: "#/components/schemas/SealProposal" },
      },
    },
    required: ["proposals"],
  },
  ErrorResponse: errorResponseSchema,
} as const;

function jsonResponse(schemaRef: string) {
  return {
    content: {
      "application/json": {
        schema: { $ref: schemaRef },
      },
    },
  };
}

function errorResponses() {
  return {
    "401": {
      description: "Missing or invalid tenant API key.",
      ...jsonResponse("#/components/schemas/ErrorResponse"),
    },
  };
}

export function buildPublicEvalOpenApiDocument(origin: string) {
  const routes = publicEvalApiV1Contract.routes;
  return {
    openapi: "3.1.0",
    info: {
      title: "MemRoOS Public Eval API",
      version: PUBLIC_EVAL_API_V1_CONTRACT_ID,
      description:
        "Tenant-scoped public evaluation API for submitting agent traces, reading scored runs, and listing SEAL proposals.",
    },
    servers: [{ url: origin.replace(/\/$/, "") }],
    "x-memroos-contract": PUBLIC_EVAL_API_V1_CONTRACT_ID,
    paths: {
      [routes.submitTrace.path]: {
        post: {
          operationId: "submitEvalTrace",
          summary: "Submit an agent trace for scoring",
          description:
            "Accepts MemRoOS AgentEvalTrace JSON or an OpenInference flat attribute bag and returns the composite W score.",
          security: [{ TenantBearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/AgentEvalTrace" },
                    { $ref: "#/components/schemas/OpenInferenceTrace" },
                  ],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Trace scored and persisted for the authenticated tenant.",
              headers: {
                [PUBLIC_EVAL_CONTRACT_HEADER]: {
                  schema: { type: "string", const: PUBLIC_EVAL_API_V1_CONTRACT_ID },
                  description: "Stable public eval contract identifier.",
                },
                "X-RateLimit-Limit": { schema: { type: "string" } },
                "X-RateLimit-Remaining": { schema: { type: "string" } },
                "X-RateLimit-Reset": { schema: { type: "string" } },
              },
              ...jsonResponse("#/components/schemas/EvalSubmitResult"),
            },
            "400": {
              description: "Request body is missing or does not match either supported trace format.",
              ...jsonResponse("#/components/schemas/ErrorResponse"),
            },
            ...errorResponses(),
            "429": {
              description: "Tenant rate limit exceeded.",
              ...jsonResponse("#/components/schemas/ErrorResponse"),
            },
            "500": {
              description: "Eval scoring failed.",
              ...jsonResponse("#/components/schemas/ErrorResponse"),
            },
          },
        },
      },
      [routes.getRun.path]: {
        get: {
          operationId: "getEvalRun",
          summary: "Fetch one scored eval run",
          security: [{ TenantBearerAuth: [] }],
          parameters: [
            {
              name: "runId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
          ],
          responses: {
            "200": {
              description: "Run owned by the authenticated tenant.",
              ...jsonResponse("#/components/schemas/GetRunResponse"),
            },
            ...errorResponses(),
            "403": {
              description: "The run exists but belongs to a different tenant.",
              ...jsonResponse("#/components/schemas/ErrorResponse"),
            },
            "404": {
              description: "Run not found.",
              ...jsonResponse("#/components/schemas/ErrorResponse"),
            },
          },
        },
      },
      [routes.listProposals.path]: {
        get: {
          operationId: "listEvalProposals",
          summary: "List SEAL proposals for the authenticated tenant",
          security: [{ TenantBearerAuth: [] }],
          parameters: [
            {
              name: "traceId",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Limit proposals to one trace ID.",
            },
          ],
          responses: {
            "200": {
              description: "Tenant-scoped proposal summaries.",
              ...jsonResponse("#/components/schemas/ListProposalsResponse"),
            },
            ...errorResponses(),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        TenantBearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Tenant API key created for the public eval API.",
        },
      },
      schemas: publicEvalApiV1OpenApiSchemas,
    },
  };
}

export function publicEvalContractHeaders(existing: Record<string, string> = {}): Record<string, string> {
  return {
    ...existing,
    [PUBLIC_EVAL_CONTRACT_HEADER]: PUBLIC_EVAL_API_V1_CONTRACT_ID,
  };
}

export function isAgentEvalTrace(value: unknown): value is AgentEvalTrace {
  return agentEvalTraceSchema.safeParse(value).success;
}

export function parseAgentEvalTrace(value: unknown): AgentEvalTrace {
  return agentEvalTraceSchema.parse(value) as AgentEvalTrace;
}

export function parseEvalSubmitResult(value: unknown): {
  runId: string;
  w: number;
  layers: Record<string, EvalLayerBreakdown>;
  proposalIds: string[];
  tenantId: string;
} {
  return evalSubmitResultSchema.parse(value) as {
    runId: string;
    w: number;
    layers: Record<string, EvalLayerBreakdown>;
    proposalIds: string[];
    tenantId: string;
  };
}

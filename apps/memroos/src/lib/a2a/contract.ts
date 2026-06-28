import { z } from "zod";

import {
  A2A_CANONICAL_AGENT_CARD_PATH,
  A2A_COMPAT_AGENT_CARD_PATH,
  A2A_TASK_STATES,
  type A2aAgentCard,
  type A2aMessage,
  type A2aMessagePart,
  type A2aTask,
  type A2aTaskEvent,
} from "./types";
import { A2A_HTTP_JSON_ROUTES, A2A_JSON_RPC_METHODS } from "./bindings";

export const A2A_CONTRACT_ID = "memroos-a2a.v1";
export const A2A_CONTRACT_HEADER = "X-Memroos-Contract";

const jsonObjectSchema = z.record(z.unknown());

const jsonObjectOpenApiSchema = {
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

export const a2aMessagePartSchema: z.ZodType<A2aMessagePart> = z
  .object({
    kind: z.enum(["text", "data", "file"]),
    text: z.string().optional(),
    data: z.unknown().optional(),
    file: z
      .object({
        name: z.string().optional(),
        mimeType: z.string().optional(),
        uri: z.string().optional(),
        bytes: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const a2aMessageSchema: z.ZodType<A2aMessage> = z
  .object({
    messageId: z.string().min(1),
    role: z.enum(["user", "agent"]),
    parts: z.array(a2aMessagePartSchema),
    contextId: z.string().optional(),
    taskId: z.string().optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .passthrough();

const a2aArtifactSchema = z
  .object({
    artifactId: z.string().min(1),
    name: z.string().optional(),
    description: z.string().optional(),
    parts: z.array(a2aMessagePartSchema),
    metadata: jsonObjectSchema.optional(),
  })
  .passthrough();

export const a2aTaskSchema: z.ZodType<A2aTask> = z
  .object({
    id: z.string().min(1),
    contextId: z.string().optional(),
    status: z
      .object({
        state: z.enum(A2A_TASK_STATES),
        message: a2aMessageSchema.optional(),
        timestamp: z.string().optional(),
      })
      .passthrough(),
    history: z.array(a2aMessageSchema).optional(),
    artifacts: z.array(a2aArtifactSchema).optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .passthrough();

export const a2aTaskEventSchema = z
  .object({
    taskId: z.string().min(1),
    contextId: z.string().optional(),
    kind: z.enum(["task", "status-update", "artifact-update", "message"]),
    sequence: z.number().optional(),
    final: z.boolean().optional(),
    task: a2aTaskSchema.optional(),
    message: a2aMessageSchema.optional(),
    artifact: a2aArtifactSchema.optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .passthrough();

const a2aAgentSkillSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string()).optional(),
    examples: z.array(z.string()).optional(),
    inputModes: z.array(z.string()).optional(),
    outputModes: z.array(z.string()).optional(),
  })
  .passthrough();

const a2aSecuritySchemeSchema = z.union([
  z
    .object({
      type: z.literal("http"),
      scheme: z.literal("bearer"),
      bearerFormat: z.string().optional(),
      description: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("apiKey"),
      in: z.enum(["header", "query", "cookie"]),
      name: z.string().min(1),
      description: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.enum(["oauth2", "openIdConnect"]),
      description: z.string().optional(),
    })
    .passthrough(),
]);

export const a2aAgentCardSchema: z.ZodType<A2aAgentCard> = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    version: z.string().min(1),
    url: z.string().url(),
    preferredTransport: z.enum(["HTTP+JSON", "JSON-RPC"]),
    capabilities: z
      .object({
        streaming: z.boolean(),
        pushNotifications: z.boolean(),
        stateTransitionHistory: z.boolean(),
      })
      .passthrough(),
    defaultInputModes: z.array(z.string()),
    defaultOutputModes: z.array(z.string()),
    securitySchemes: z.record(a2aSecuritySchemeSchema),
    security: z.array(z.record(z.array(z.string()))),
    skills: z.array(a2aAgentSkillSchema),
    extensions: z
      .object({
        memroos: z
          .object({
            profile: z.string().min(1),
            cardPaths: z.object({
              canonical: z.literal(A2A_CANONICAL_AGENT_CARD_PATH),
              compatibility: z.literal(A2A_COMPAT_AGENT_CARD_PATH),
            }),
            compatibilityAlias: z.boolean().optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export const a2aContract = {
  id: A2A_CONTRACT_ID,
  routes: {
    canonicalAgentCard: {
      method: "GET",
      path: A2A_CANONICAL_AGENT_CARD_PATH,
      response: "A2aAgentCard",
    },
    compatibilityAgentCard: {
      method: "GET",
      path: A2A_COMPAT_AGENT_CARD_PATH,
      response: "A2aAgentCard",
    },
    jsonRpcDispatch: {
      method: "POST",
      path: "/api/a2a",
      request: "JsonRpcRequest",
      response: "JsonRpcResponse",
    },
  },
  httpJsonRoutes: A2A_HTTP_JSON_ROUTES,
  jsonRpcMethods: A2A_JSON_RPC_METHODS,
  taskStates: A2A_TASK_STATES,
} as const;

const a2aOpenApiSchemas = {
  A2aMessagePart: {
    type: "object",
    additionalProperties: true,
    properties: {
      kind: { type: "string", enum: ["text", "data", "file"] },
      text: { type: "string" },
      data: true,
      file: {
        type: "object",
        additionalProperties: true,
        properties: {
          name: { type: "string" },
          mimeType: { type: "string" },
          uri: { type: "string" },
          bytes: { type: "string" },
        },
      },
    },
    required: ["kind"],
  },
  A2aMessage: {
    type: "object",
    additionalProperties: true,
    properties: {
      messageId: { type: "string", minLength: 1 },
      role: { type: "string", enum: ["user", "agent"] },
      parts: {
        type: "array",
        items: { $ref: "#/components/schemas/A2aMessagePart" },
      },
      contextId: { type: "string" },
      taskId: { type: "string" },
      metadata: jsonObjectOpenApiSchema,
    },
    required: ["messageId", "role", "parts"],
  },
  A2aArtifact: {
    type: "object",
    additionalProperties: true,
    properties: {
      artifactId: { type: "string", minLength: 1 },
      name: { type: "string" },
      description: { type: "string" },
      parts: {
        type: "array",
        items: { $ref: "#/components/schemas/A2aMessagePart" },
      },
      metadata: jsonObjectOpenApiSchema,
    },
    required: ["artifactId", "parts"],
  },
  A2aTask: {
    type: "object",
    additionalProperties: true,
    properties: {
      id: { type: "string", minLength: 1 },
      contextId: { type: "string" },
      status: {
        type: "object",
        additionalProperties: true,
        properties: {
          state: { type: "string", enum: A2A_TASK_STATES },
          message: { $ref: "#/components/schemas/A2aMessage" },
          timestamp: { type: "string" },
        },
        required: ["state"],
      },
      history: {
        type: "array",
        items: { $ref: "#/components/schemas/A2aMessage" },
      },
      artifacts: {
        type: "array",
        items: { $ref: "#/components/schemas/A2aArtifact" },
      },
      metadata: jsonObjectOpenApiSchema,
    },
    required: ["id", "status"],
  },
  A2aTaskEvent: {
    type: "object",
    additionalProperties: true,
    properties: {
      taskId: { type: "string", minLength: 1 },
      contextId: { type: "string" },
      kind: { type: "string", enum: ["task", "status-update", "artifact-update", "message"] },
      sequence: { type: "number" },
      final: { type: "boolean" },
      task: { $ref: "#/components/schemas/A2aTask" },
      message: { $ref: "#/components/schemas/A2aMessage" },
      artifact: { $ref: "#/components/schemas/A2aArtifact" },
      metadata: jsonObjectOpenApiSchema,
    },
    required: ["taskId", "kind"],
  },
  A2aAgentCard: {
    type: "object",
    additionalProperties: true,
    properties: {
      name: { type: "string", minLength: 1 },
      description: { type: "string", minLength: 1 },
      version: { type: "string", minLength: 1 },
      url: { type: "string", format: "uri" },
      preferredTransport: { type: "string", enum: ["HTTP+JSON", "JSON-RPC"] },
      capabilities: {
        type: "object",
        additionalProperties: true,
        properties: {
          streaming: { type: "boolean" },
          pushNotifications: { type: "boolean" },
          stateTransitionHistory: { type: "boolean" },
        },
        required: ["streaming", "pushNotifications", "stateTransitionHistory"],
      },
      defaultInputModes: { type: "array", items: { type: "string" } },
      defaultOutputModes: { type: "array", items: { type: "string" } },
      securitySchemes: {
        type: "object",
        additionalProperties: true,
      },
      security: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      skills: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            id: { type: "string", minLength: 1 },
            name: { type: "string", minLength: 1 },
            description: { type: "string", minLength: 1 },
            tags: { type: "array", items: { type: "string" } },
            examples: { type: "array", items: { type: "string" } },
            inputModes: { type: "array", items: { type: "string" } },
            outputModes: { type: "array", items: { type: "string" } },
          },
          required: ["id", "name", "description"],
        },
      },
      extensions: jsonObjectOpenApiSchema,
    },
    required: [
      "name",
      "description",
      "version",
      "url",
      "preferredTransport",
      "capabilities",
      "defaultInputModes",
      "defaultOutputModes",
      "securitySchemes",
      "security",
      "skills",
      "extensions",
    ],
  },
  JsonRpcRequest: {
    type: "object",
    additionalProperties: true,
    properties: {
      jsonrpc: { type: "string", const: "2.0" },
      id: {
        anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
      },
      method: { type: "string", enum: A2A_JSON_RPC_METHODS },
      params: jsonObjectOpenApiSchema,
    },
    required: ["jsonrpc", "method"],
  },
  JsonRpcResponse: {
    type: "object",
    additionalProperties: false,
    properties: {
      jsonrpc: { type: "string", const: "2.0" },
      id: {
        anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
      },
      result: true,
      error: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "number" },
          message: { type: "string" },
        },
        required: ["code", "message"],
      },
    },
    required: ["jsonrpc", "id"],
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

function contractHeader() {
  return {
    [A2A_CONTRACT_HEADER]: {
      schema: { type: "string", const: A2A_CONTRACT_ID },
      description: "Stable MemRoOS A2A contract identifier.",
    },
  };
}

export function buildA2aOpenApiDocument(origin: string) {
  const routes = a2aContract.routes;

  return {
    openapi: "3.1.0",
    info: {
      title: "MemRoOS A2A API",
      version: A2A_CONTRACT_ID,
      description:
        "Agent card discovery and JSON-RPC dispatch contract for the MemRoOS A2A broker.",
    },
    servers: [{ url: origin.replace(/\/$/, "") }],
    "x-memroos-contract": A2A_CONTRACT_ID,
    paths: {
      [routes.canonicalAgentCard.path]: {
        get: {
          operationId: "getA2aAgentCard",
          summary: "Fetch the canonical A2A agent card",
          responses: {
            "200": {
              description: "Canonical MemRoOS A2A agent card.",
              headers: contractHeader(),
              ...jsonResponse("#/components/schemas/A2aAgentCard"),
            },
          },
        },
      },
      [routes.compatibilityAgentCard.path]: {
        get: {
          operationId: "getA2aAgentCardAlias",
          summary: "Fetch the legacy compatibility A2A agent card alias",
          responses: {
            "200": {
              description: "Compatibility alias for clients using the legacy well-known path.",
              headers: contractHeader(),
              ...jsonResponse("#/components/schemas/A2aAgentCard"),
            },
          },
        },
      },
      [routes.jsonRpcDispatch.path]: {
        post: {
          operationId: "dispatchA2aJsonRpc",
          summary: "Dispatch an A2A JSON-RPC request",
          security: [{ AgentBearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JsonRpcRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "JSON-RPC response for a supported A2A method.",
              headers: contractHeader(),
              ...jsonResponse("#/components/schemas/JsonRpcResponse"),
            },
            "400": {
              description: "Request body is not a valid A2A JSON-RPC request.",
              ...jsonResponse("#/components/schemas/ErrorResponse"),
            },
            "401": {
              description: "Missing or invalid A2A bearer credential.",
              ...jsonResponse("#/components/schemas/ErrorResponse"),
            },
            "500": {
              description: "A2A broker dispatch failed.",
              ...jsonResponse("#/components/schemas/ErrorResponse"),
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        AgentBearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Bearer credential issued by the MemRoOS agent registry.",
        },
      },
      schemas: a2aOpenApiSchemas,
    },
  };
}

export function a2aContractHeaders(existing: Record<string, string> = {}): Record<string, string> {
  return {
    ...existing,
    [A2A_CONTRACT_HEADER]: A2A_CONTRACT_ID,
  };
}

export function parseA2aAgentCard(value: unknown): A2aAgentCard {
  return a2aAgentCardSchema.parse(value);
}

export function parseA2aTask(value: unknown): A2aTask {
  return a2aTaskSchema.parse(value);
}

export function parseA2aTaskEvent(value: unknown): A2aTaskEvent {
  return a2aTaskEventSchema.parse(value) as unknown as A2aTaskEvent;
}

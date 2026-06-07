export const dynamic = "force-dynamic";

// For reverse-proxy deployments, MEMROOS_CHATGPT_ACTIONS_PUBLIC_BASE_URL must be set
// to the public-facing base URL. Without it, the literal request URL origin is used.
// x-forwarded-host is intentionally not trusted (prevents spec URL poisoning — SEC-03/B01-003).
function publicBaseUrl(request: Request): string {
  const configured = process.env.MEMROOS_CHATGPT_ACTIONS_PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const origin = publicBaseUrl(request);
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "MemRoOS Mobile Actions",
      version: "1.0.0",
      description: "Search, fetch, and save MemRoOS memories from a Custom GPT on ChatGPT mobile.",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/chatgpt/actions/search": {
        post: {
          operationId: "searchMemroos",
          summary: "Search MemRoOS memory",
          description: "Use this when the user asks to search or recall MemRoOS memory, notes, projects, or agent context.",
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    query: { type: "string", description: "The natural-language memory search query." },
                    limit: { type: "integer", minimum: 1, maximum: 20, default: 8 },
                  },
                  required: ["query"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Matching MemRoOS memories.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SearchResponse" },
                },
              },
            },
          },
        },
      },
      "/api/chatgpt/actions/fetch": {
        post: {
          operationId: "fetchMemroosResult",
          summary: "Fetch a MemRoOS search result",
          description: "Use this to expand a specific result returned by searchMemroos.",
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string", description: "The result id returned by searchMemroos." },
                  },
                  required: ["id"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "The selected memory result.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FetchResponse" },
                },
              },
            },
          },
        },
      },
      "/api/chatgpt/actions/save": {
        post: {
          operationId: "saveMemroosMemory",
          summary: "Save a memory to MemRoOS",
          description: "Use this only when the user explicitly asks to remember, save, log, or archive information in MemRoOS.",
          "x-openai-isConsequential": true,
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    text: { type: "string", description: "The memory text to save." },
                    type: {
                      type: "string",
                      enum: ["episodic", "vector"],
                      default: "episodic",
                      description: "Use episodic for events/notes and vector for durable semantic facts.",
                    },
                    source: { type: "string", default: "chatgpt-mobile" },
                    metadata: { type: "object", additionalProperties: true },
                  },
                  required: ["text"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Memory save result.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SaveResponse" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
        },
      },
      schemas: {
        SearchResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            query: { type: "string" },
            results: {
              type: "array",
              items: { $ref: "#/components/schemas/MemroosResult" },
            },
            tiers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tier: { type: "string" },
                  ok: { type: "boolean" },
                  count: { type: "integer" },
                  error: { type: "string" },
                },
              },
            },
          },
        },
        FetchResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            id: { type: "string" },
            title: { type: "string" },
            text: { type: "string" },
            tier: { type: "string" },
            source: { type: "string" },
            score: { type: "number" },
          },
        },
        SaveResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            tier: { type: "string" },
            result: { type: "object", additionalProperties: true },
            timestamp: { type: "string" },
          },
        },
        MemroosResult: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            text: { type: "string" },
            tier: { type: "string" },
            source: { type: "string" },
            score: { type: "number" },
            metadata: { type: "object", additionalProperties: true },
          },
        },
      },
    },
  });
}

import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { UNDERSTAND_NOINDEX_HEADERS } from "@/lib/understand-policy";

type UnderstandRouteHandler = () => Response | Promise<Response>;
type UnderstandJsonLoader = () => unknown | Promise<unknown>;

const UNDERSTAND_DATA_DIR = path.join(process.cwd(), "src/data/understand");

let graphPromise: Promise<unknown> | null = null;
let metaPromise: Promise<unknown> | null = null;
let configPromise: Promise<unknown> | null = null;

function tokenDigest(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

async function readUnderstandJson(filename: string): Promise<unknown> {
  const raw = await readFile(path.join(UNDERSTAND_DATA_DIR, filename), "utf8");
  return JSON.parse(raw) as unknown;
}

export function hasValidUnderstandGraphToken(request: Request): boolean {
  const configuredToken = process.env.UNDERSTAND_GRAPH_TOKEN;
  if (!configuredToken) return false;

  const requestUrl = new URL(request.url);
  const requestToken = requestUrl.searchParams.get("token");
  if (!requestToken) return false;

  return timingSafeEqual(tokenDigest(requestToken), tokenDigest(configuredToken));
}

export function forbiddenUnderstandResponse(): Response {
  return Response.json(
    { error: "Forbidden: missing or invalid token" },
    { status: 403, headers: UNDERSTAND_NOINDEX_HEADERS }
  );
}

export function understandJsonResponse(data: unknown): Response {
  return Response.json(data, { headers: UNDERSTAND_NOINDEX_HEADERS });
}

export function makeUnderstandRoute(handler: UnderstandRouteHandler) {
  return async function GET(request: Request): Promise<Response> {
    if (!hasValidUnderstandGraphToken(request)) {
      return forbiddenUnderstandResponse();
    }

    return handler();
  };
}

export function makeUnderstandJsonRoute(loadData: UnderstandJsonLoader) {
  return makeUnderstandRoute(async () => understandJsonResponse(await loadData()));
}

export function getUnderstandGraph(): Promise<unknown> {
  graphPromise ??= readUnderstandJson("knowledge-graph.json");
  return graphPromise;
}

export function getUnderstandMeta(): Promise<unknown> {
  metaPromise ??= readUnderstandJson("meta.json");
  return metaPromise;
}

export function getUnderstandConfig(): Promise<unknown> {
  configPromise ??= readUnderstandJson("config.json");
  return configPromise;
}

const TOP_LEVEL_MESSAGE_KEYS = new Set([
  "agentId",
  "agent_id",
  "fromAgent",
  "from_agent",
  "toAgent",
  "to_agent",
  "body",
  "content",
  "text",
  "subject",
  "messageType",
  "message_type",
  "threadId",
  "thread_id",
  "correlationId",
  "correlation_id",
  "parentId",
  "parent_id",
  "priority",
  "contextRefs",
  "context_refs",
  "artifacts",
  "visibility",
  "policy",
  "replyRequired",
  "reply_required",
  "expiresAt",
  "expires_at",
  "saveToMemory",
  "save_to_memory",
  "memoryType",
  "memory_type",
  "memoryMetadata",
  "memory_metadata",
]);

const SELF_DECLARED_ACCESS_KEY = /(?:on_?behalf|oauth|credential|bearer|access_?token|refresh_?token|scope|consent|data_?access|user_?role|tenant_?id|project_?id|agent_?version)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectClaims(value: unknown, path: string, claims: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectClaims(item, `${path}[${index}]`, claims));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    const isAllowedTopLevel = path === "" && TOP_LEVEL_MESSAGE_KEYS.has(key);
    if (!isAllowedTopLevel && SELF_DECLARED_ACCESS_KEY.test(key)) {
      claims.push(nextPath);
    }
    collectClaims(child, nextPath, claims);
  }
}

export function findSelfDeclaredAccessClaims(payload: unknown): string[] {
  const claims: string[] = [];
  collectClaims(payload, "", claims);
  return claims;
}

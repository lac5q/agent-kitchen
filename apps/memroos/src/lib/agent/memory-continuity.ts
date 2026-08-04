import crypto from "crypto";
import type Database from "better-sqlite3";

import { scanContent, type ScanMatch } from "@/lib/content-scanner";
import {
  looksLikeTranscriptDump,
  projectCaptureDepth,
  type CaptureDepth,
} from "@/lib/observe-capture-depth";
import { writeVaultArtifact } from "@/lib/vault/writer";

type JsonObject = Record<string, unknown>;
type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

export type CodingAgentRuntime =
  | "codex"
  | "claude-code"
  | "hermes"
  | "openclaw"
  | "opencode"
  | "gemini-cli"
  | "qwen-cli"
  | "pi"
  | "cursor"
  | "droid"
  | "other";

export interface CodingAgentCaptureInput {
  tenantId?: string;
  sourceAgentId: string;
  runtime: CodingAgentRuntime | string;
  project?: string | null;
  repoPath?: string | null;
  sessionId: string;
  taskId?: string | null;
  capturedAt?: string;
  modelRoute?: JsonObject;
  summary?: string;
  decisionIntent?: JsonObject;
  sources?: JsonValue[];
  files?: JsonValue[];
  commands?: JsonValue[];
  errors?: JsonValue[];
  verification?: JsonValue[];
  events?: JsonValue[];
  /** Optional full transcript; only sealed at captureDepth=full. */
  transcript?: string | null;
  /** summary | relevant | full — default relevant (MEMROOS_CAPTURE_DEPTH). */
  captureDepth?: CaptureDepth | string;
  metadata?: JsonObject;
}

export interface CapturedCodingAgentSession {
  id: string;
  duplicate: boolean;
  tenantId: string;
  sourceAgentId: string;
  runtime: string;
  sessionId: string;
  taskId: string | null;
  captureHealth: "ok" | "redacted" | "warning" | "failed";
  rawArtifactId: string | null;
  candidateCount: number;
  captureDepth: CaptureDepth;
  redactions: ScanMatch[];
}

export interface HandoffPackInput {
  tenantId?: string;
  taskId?: string | null;
  sessionId?: string | null;
  fromAgentId?: string | null;
  toAgentId?: string | null;
  tokenBudget?: number;
}

export interface HandoffPack {
  id: string;
  tenantId: string;
  title: string;
  taskId: string | null;
  sessionId: string | null;
  fromAgentId: string | null;
  toAgentId: string | null;
  contextPack: JsonObject;
  sourceCaptureIds: string[];
  tokenBudget: number;
  redactionState: "none" | "redacted" | "review_required";
  createdAt: string;
}

const MAX_FIELD_CHARS = 6000;
const MAX_ARRAY_ITEMS = 40;

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as JsonObject)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as JsonObject)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function scanAndRedact(value: string): { value: string; matches: ScanMatch[] } {
  const bounded = value.length > MAX_FIELD_CHARS ? `${value.slice(0, MAX_FIELD_CHARS)}\n[TRUNCATED]` : value;
  const scan = scanContent(bounded);
  return { value: scan.cleanContent, matches: scan.matches };
}

function sanitizeValue(value: unknown, matches: ScanMatch[], depth = 0): JsonValue {
  if (depth > 4) return "[TRUNCATED]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const result = scanAndRedact(value);
    matches.push(...result.matches);
    return result.value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, matches, depth + 1));
  }
  if (typeof value === "object") {
    const out: JsonObject = {};
    for (const [key, child] of Object.entries(value as JsonObject)) {
      out[key] = sanitizeValue(child, matches, depth + 1);
    }
    return out;
  }
  return String(value);
}

function sanitizeArray(value: unknown, matches: ScanMatch[]): JsonValue[] {
  if (!Array.isArray(value)) return [];
  return sanitizeValue(value, matches) as JsonValue[];
}

function sanitizeObject(value: unknown, matches: ScanMatch[]): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return sanitizeValue(value, matches) as JsonObject;
}

function captureHealth(matches: ScanMatch[]): CapturedCodingAgentSession["captureHealth"] {
  if (matches.some((match) => match.severity === "HIGH")) return "redacted";
  if (matches.length > 0) return "warning";
  return "ok";
}

function compactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return stableJson(value).slice(0, 1000);
  return "";
}

function durableCandidates(input: {
  summary: string;
  decisionIntent: JsonObject;
  files: JsonValue[];
  errors: JsonValue[];
  verification: JsonValue[];
  sources: JsonValue[];
}): Array<{ memoryType: string; content: string; metadata: JsonObject }> {
  const candidates: Array<{ memoryType: string; content: string; metadata: JsonObject }> = [];
  if (input.summary.trim()) {
    candidates.push({
      memoryType: "task_state",
      content: `Task state: ${input.summary.trim()}`,
      metadata: { source: "coding_agent_capture" },
    });
  }
  if (Object.keys(input.decisionIntent).length > 0) {
    candidates.push({
      memoryType: "decision_intent",
      content: `Decision intent: ${compactText(input.decisionIntent)}`,
      metadata: { source: "coding_agent_capture" },
    });
  }
  for (const item of input.errors.slice(0, 3)) {
    const text = compactText(item);
    if (text) candidates.push({ memoryType: "lesson", content: `Observed failure: ${text}`, metadata: { source: "coding_agent_capture" } });
  }
  for (const item of input.verification.slice(0, 3)) {
    const text = compactText(item);
    if (text) candidates.push({ memoryType: "verification", content: `Verification result: ${text}`, metadata: { source: "coding_agent_capture" } });
  }
  for (const item of input.sources.slice(0, 5)) {
    const text = compactText(item);
    if (text) candidates.push({ memoryType: "source_pointer", content: `Source used: ${text}`, metadata: { source: "coding_agent_capture" } });
  }
  for (const item of input.files.slice(0, 5)) {
    const text = compactText(item);
    if (text) candidates.push({ memoryType: "runbook", content: `File context: ${text}`, metadata: { source: "coding_agent_capture" } });
  }
  return candidates.slice(0, 12);
}

export function captureCodingAgentSession(
  db: Database.Database,
  input: CodingAgentCaptureInput
): CapturedCodingAgentSession {
  if (!input.sourceAgentId?.trim()) throw new Error("sourceAgentId is required");
  if (!input.runtime?.trim()) throw new Error("runtime is required");
  if (!input.sessionId?.trim()) throw new Error("sessionId is required");

  const redactions: ScanMatch[] = [];
  const tenantId = input.tenantId ?? "default-tenant";
  const capturedAt = input.capturedAt ?? nowIso();
  const depthProjection = projectCaptureDepth(
    {
      summary: input.summary,
      decisionIntent: input.decisionIntent,
      sources: input.sources,
      files: input.files,
      commands: input.commands,
      errors: input.errors,
      verification: input.verification,
      events: input.events,
      transcript: input.transcript,
      metadata: input.metadata,
    },
    input.captureDepth
  );
  const captureDepth = depthProjection.depth;

  const summary = String(sanitizeValue(depthProjection.indexable.summary ?? "", redactions));
  const decisionIntent = sanitizeObject(depthProjection.indexable.decisionIntent, redactions);
  const sources = sanitizeArray(depthProjection.indexable.sources as JsonValue[], redactions);
  const files = sanitizeArray(depthProjection.indexable.files as JsonValue[], redactions);
  const commands = sanitizeArray(depthProjection.indexable.commands as JsonValue[], redactions);
  const errors = sanitizeArray(depthProjection.indexable.errors as JsonValue[], redactions);
  const verification = sanitizeArray(depthProjection.indexable.verification as JsonValue[], redactions);
  const modelRoute = sanitizeObject(input.modelRoute, redactions);
  const metadata = sanitizeObject(
    {
      ...(input.metadata ?? {}),
      captureDepth,
    },
    redactions
  );
  const sealedEvents = depthProjection.sealTranscript
    ? sanitizeArray(depthProjection.sealedEvents as JsonValue[], redactions)
    : [];
  const sealedTranscript = depthProjection.sealTranscript
    ? String(sanitizeValue(depthProjection.sealedTranscript ?? "", redactions))
    : "";

  const normalized = {
    tenantId,
    sourceAgentId: input.sourceAgentId,
    runtime: input.runtime,
    project: input.project ?? null,
    repoPath: input.repoPath ?? null,
    sessionId: input.sessionId,
    taskId: input.taskId ?? null,
    capturedAt,
    captureDepth,
    modelRoute,
    summary,
    decisionIntent,
    sources,
    files,
    commands,
    errors,
    verification,
    metadata,
  };
  const captureHash = sha256(stableJson({
    sourceAgentId: input.sourceAgentId,
    runtime: input.runtime,
    project: input.project ?? null,
    repoPath: input.repoPath ?? null,
    sessionId: input.sessionId,
    taskId: input.taskId ?? null,
    captureDepth,
    modelRoute,
    summary,
    decisionIntent,
    sources,
    files,
    commands,
    errors,
    verification,
    metadata,
    events: depthProjection.sealTranscript ? sealedEvents : [],
    transcript: depthProjection.sealTranscript ? sealedTranscript : null,
  }));
  const duplicateRow = db
    .prepare("SELECT id, raw_artifact_id, capture_health FROM agent_session_captures WHERE tenant_id = ? AND capture_hash = ?")
    .get(tenantId, captureHash) as { id: string; raw_artifact_id: string | null; capture_health: string } | undefined;
  if (duplicateRow) {
    return {
      id: duplicateRow.id,
      duplicate: true,
      tenantId,
      sourceAgentId: input.sourceAgentId,
      runtime: input.runtime,
      sessionId: input.sessionId,
      taskId: input.taskId ?? null,
      captureHealth: duplicateRow.capture_health as CapturedCodingAgentSession["captureHealth"],
      rawArtifactId: duplicateRow.raw_artifact_id,
      candidateCount: 0,
      captureDepth,
      redactions,
    };
  }

  const rawBody = `${JSON.stringify({
    schema: "memroos.coding_agent_capture.v1",
    capturedAt,
    captureDepth,
    original: {
      ...input,
      // Never persist full transcript in the stored "original" unless depth=full.
      events: depthProjection.sealTranscript ? input.events ?? [] : undefined,
      transcript: depthProjection.sealTranscript ? input.transcript ?? null : undefined,
    },
    normalized,
    sealed: depthProjection.sealTranscript
      ? {
          events: sealedEvents,
          transcript: sealedTranscript || null,
          retention: depthProjection.vaultLabel.retention,
        }
      : null,
  })}\n`;
  const rawArtifact = writeVaultArtifact(db, {
    tenantId,
    sourceType: "coding_agent_session",
    sourceId: input.sourceAgentId,
    sessionId: input.sessionId,
    project: input.project ?? undefined,
    body: rawBody,
    replayMetadata: {
      runtime: input.runtime,
      taskId: input.taskId ?? null,
      captureHash,
      captureDepth,
      adapter: "agent-memory-continuity",
    },
    label: {
      visibility: depthProjection.vaultLabel.visibility,
      sensitivity: redactions.some((match) => match.severity === "HIGH")
        ? "credential"
        : depthProjection.vaultLabel.sensitivity,
      policy: depthProjection.vaultLabel.policy,
    },
  });

  const id = crypto.randomUUID();
  const health = captureHealth(redactions);
  db.prepare(
    `INSERT INTO agent_session_captures (
       id, tenant_id, source_agent_id, runtime, project, repo_path, session_id, task_id,
       status, capture_health, model_route_json, summary, decision_intent_json, sources_json,
       files_json, commands_json, errors_json, verification_json, metadata_json, raw_artifact_id,
       capture_hash, captured_at, updated_at
     ) VALUES (
       @id, @tenantId, @sourceAgentId, @runtime, @project, @repoPath, @sessionId, @taskId,
       @status, @captureHealth, @modelRouteJson, @summary, @decisionIntentJson, @sourcesJson,
       @filesJson, @commandsJson, @errorsJson, @verificationJson, @metadataJson, @rawArtifactId,
       @captureHash, @capturedAt, @updatedAt
     )`
  ).run({
    id,
    tenantId,
    sourceAgentId: input.sourceAgentId,
    runtime: input.runtime,
    project: input.project ?? null,
    repoPath: input.repoPath ?? null,
    sessionId: input.sessionId,
    taskId: input.taskId ?? null,
    status: "handoff_ready",
    captureHealth: health,
    modelRouteJson: JSON.stringify(modelRoute),
    summary,
    decisionIntentJson: JSON.stringify(decisionIntent),
    sourcesJson: JSON.stringify(sources),
    filesJson: JSON.stringify(files),
    commandsJson: JSON.stringify(commands),
    errorsJson: JSON.stringify(errors),
    verificationJson: JSON.stringify(verification),
    metadataJson: JSON.stringify({ ...metadata, redactionMatches: redactions, captureDepth }),
    rawArtifactId: rawArtifact.id,
    captureHash,
    capturedAt,
    updatedAt: capturedAt,
  });

  const candidates = durableCandidates({ summary, decisionIntent, files, errors, verification, sources }).filter(
    (candidate) => !looksLikeTranscriptDump(candidate.content)
  );
  const insertCandidate = db.prepare(
    `INSERT OR IGNORE INTO agent_memory_candidates
      (id, tenant_id, capture_id, agent_id, memory_type, content, content_hash, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const candidate of candidates) {
    const contentHash = sha256(candidate.content);
    insertCandidate.run(
      crypto.randomUUID(),
      tenantId,
      id,
      input.sourceAgentId,
      candidate.memoryType,
      candidate.content,
      contentHash,
      JSON.stringify({ ...candidate.metadata, captureDepth })
    );
  }

  return {
    id,
    duplicate: false,
    tenantId,
    sourceAgentId: input.sourceAgentId,
    runtime: input.runtime,
    sessionId: input.sessionId,
    taskId: input.taskId ?? null,
    captureHealth: health,
    rawArtifactId: rawArtifact.id,
    candidateCount: candidates.length,
    captureDepth,
    redactions,
  };
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function buildCodingAgentHandoffPack(
  db: Database.Database,
  input: HandoffPackInput
): HandoffPack {
  const tenantId = input.tenantId ?? "default-tenant";
  if (!input.taskId && !input.sessionId && !input.fromAgentId) {
    throw new Error("taskId, sessionId, or fromAgentId is required");
  }
  const tokenBudget = Math.min(Math.max(input.tokenBudget ?? 4000, 500), 12000);
  const rows = db
    .prepare(
      `SELECT * FROM agent_session_captures
       WHERE tenant_id = ?
         AND (? IS NULL OR task_id = ?)
         AND (? IS NULL OR session_id = ?)
         AND (? IS NULL OR source_agent_id = ?)
       ORDER BY captured_at DESC
       LIMIT 5`
    )
    .all(
      tenantId,
      input.taskId ?? null,
      input.taskId ?? null,
      input.sessionId ?? null,
      input.sessionId ?? null,
      input.fromAgentId ?? null,
      input.fromAgentId ?? null
    ) as Array<Record<string, unknown>>;

  if (rows.length === 0) throw new Error("no coding-agent captures matched the requested handoff");

  const sourceCaptureIds = rows.map((row) => String(row.id));
  const newest = rows[0];
  const candidates = db
    .prepare(
      `SELECT memory_type, content, metadata_json
       FROM agent_memory_candidates
       WHERE tenant_id = ? AND capture_id IN (${sourceCaptureIds.map(() => "?").join(",")})
       ORDER BY created_at DESC
       LIMIT 20`
    )
    .all(tenantId, ...sourceCaptureIds) as Array<Record<string, unknown>>;

  const contextPack: JsonObject = {
    schema: "memroos.coding_agent_handoff.v1",
    instruction: "Continue this coding task from MemRoOS context. Treat raw traces as sealed evidence and use the summarized state, decision intent, sources, diffs, errors, and verification history below.",
    taskId: input.taskId ?? newest.task_id ?? null,
    sessionId: input.sessionId ?? newest.session_id ?? null,
    fromAgentId: input.fromAgentId ?? newest.source_agent_id ?? null,
    toAgentId: input.toAgentId ?? null,
    captures: rows.map((row) => ({
      id: row.id,
      sourceAgentId: row.source_agent_id,
      runtime: row.runtime,
      project: row.project,
      repoPath: row.repo_path,
      capturedAt: row.captured_at,
      summary: row.summary,
      decisionIntent: parseJson<JsonObject>(String(row.decision_intent_json ?? "{}"), {}),
      sources: parseJson<JsonValue[]>(String(row.sources_json ?? "[]"), []),
      files: parseJson<JsonValue[]>(String(row.files_json ?? "[]"), []),
      commands: parseJson<JsonValue[]>(String(row.commands_json ?? "[]"), []),
      errors: parseJson<JsonValue[]>(String(row.errors_json ?? "[]"), []),
      verification: parseJson<JsonValue[]>(String(row.verification_json ?? "[]"), []),
      modelRoute: parseJson<JsonObject>(String(row.model_route_json ?? "{}"), {}),
      rawArtifactId: row.raw_artifact_id,
      captureHealth: row.capture_health,
    })),
    durableCandidates: candidates.map((row) => ({
      memoryType: row.memory_type,
      content: row.content,
      metadata: parseJson<JsonObject>(String(row.metadata_json ?? "{}"), {}),
    })),
  };
  const redactionState = rows.some((row) => row.capture_health === "redacted")
    ? "redacted"
    : rows.some((row) => row.capture_health === "warning")
      ? "review_required"
      : "none";
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const title = `Continue ${String(newest.task_id ?? newest.session_id)} from ${String(newest.source_agent_id)}`;
  db.prepare(
    `INSERT INTO agent_handoff_packs (
       id, tenant_id, from_agent_id, to_agent_id, task_id, session_id, title, status,
       context_pack_json, source_capture_ids_json, token_budget, redaction_state, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?)`
  ).run(
    id,
    tenantId,
    input.fromAgentId ?? newest.source_agent_id ?? null,
    input.toAgentId ?? null,
    input.taskId ?? newest.task_id ?? null,
    input.sessionId ?? newest.session_id ?? null,
    title,
    JSON.stringify(contextPack),
    JSON.stringify(sourceCaptureIds),
    tokenBudget,
    redactionState,
    createdAt
  );

  return {
    id,
    tenantId,
    title,
    taskId: (input.taskId ?? newest.task_id ?? null) as string | null,
    sessionId: (input.sessionId ?? newest.session_id ?? null) as string | null,
    fromAgentId: (input.fromAgentId ?? newest.source_agent_id ?? null) as string | null,
    toAgentId: input.toAgentId ?? null,
    contextPack,
    sourceCaptureIds,
    tokenBudget,
    redactionState,
    createdAt,
  };
}

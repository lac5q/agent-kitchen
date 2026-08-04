import { NextRequest } from "next/server";
import { execFile, spawn } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildAgentContext,
  chatRuntimeStatus,
  isProviderLimitError,
  recordChatRuntimeFailure,
  recordChatRuntimeSuccess,
  resolveChatRuntime,
  resolveChatRuntimePlan,
  type ChatRuntime,
  type AgentContext,
} from "./chat-runtime";
import { getRegisteredAgent } from "@/lib/agent/registry";
import { getDb } from "@/lib/db";
import { recordEfficiencyEvent } from "@/lib/efficiency-telemetry";
import {
  buildMemoryDoctorDiagnostic,
  formatMemoryDoctorReport,
  isMemoryDoctorCommand,
} from "@/lib/memory/doctor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const client = new Anthropic();

const OPENCODE_BIN = process.env.OPENCODE_BIN || "opencode";
const OPENCODE_CHAT_ENABLED = process.env.MEMROOS_ENABLE_OPENCODE === "true";
const OPENCODE_MAX_CONCURRENT = parsePositiveInteger(
  process.env.MEMROOS_OPENCODE_MAX_CONCURRENT,
  1
);
const OPENCODE_MAX_RSS_BYTES =
  parsePositiveInteger(process.env.MEMROOS_OPENCODE_MAX_RSS_MB, 768) * 1024 * 1024;
const OPENCODE_RSS_POLL_MS = parsePositiveInteger(
  process.env.MEMROOS_OPENCODE_RSS_POLL_MS,
  2_000
);
const OPENCODE_KILL_GRACE_MS = parsePositiveInteger(
  process.env.MEMROOS_OPENCODE_KILL_GRACE_MS,
  3_000
);
type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatRequestBody = {
  message: string;
  agentId?: string;
  taskId?: string;
  history?: ChatMessage[];
  memoryHits?: unknown;
  memory_hits?: unknown;
};
type OpenCodeReservation =
  | { ok: true; release: () => void }
  | { ok: false; error: string };

let activeOpenCodeRuns = 0;

function latestUserMessage(messages: ChatMessage[]): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function normalizeQuestionText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isQuestionLike(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (text.includes("?")) return true;
  return /^(who|what|when|where|why|how|which|did|do|does|can|could|should|would|is|are|was|were|has|have|had)\b/i.test(text);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 512))
    .slice(0, 20);
}

function priorUserQuestionMatch(message: string, history: ChatMessage[]): boolean {
  const normalized = normalizeQuestionText(message);
  if (!normalized) return false;
  return history.some((entry) =>
    entry.role === "user" && normalizeQuestionText(entry.content) === normalized
  );
}

function recordOperatorQuestionTelemetry(params: {
  body: ChatRequestBody;
  agentId: string;
  message: string;
  history: ChatMessage[];
}) {
  const { body, agentId, message, history } = params;
  const memoryHits = stringList(body.memoryHits ?? body.memory_hits);
  if (!isQuestionLike(message) && memoryHits.length === 0) return;

  recordEfficiencyEvent(getDb(), {
    eventType: "operator_question",
    taskId: body.taskId ?? null,
    agentId,
    payload: {
      questionText: message.trim().slice(0, 2_000),
      memoryHits,
      priorAnswerMatch: priorUserQuestionMatch(message, history),
    },
  });
}

function humanizeAgentId(agentId: string): string {
  return agentId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildLocalFallbackResponse(params: {
  agentId: string;
  context: AgentContext;
  runtime: ChatRuntime;
  messages: ChatMessage[];
  reason: string;
}): string {
  const { agentId, context, runtime, messages, reason } = params;
  const agent = getRegisteredAgent(agentId);
  const displayName = agent?.name ?? humanizeAgentId(agentId);
  const platform = agent?.platform ?? runtime.runner;
  const lastMessage = latestUserMessage(messages);
  const isStandup = /standup|yesterday|today|blocker|conference|room/i.test(lastMessage);
  const source = context.source === "fallback" ? "registered runtime fallback" : `${context.source} agent context`;
  const providerLine = isProviderLimitError(reason)
    ? "The live model provider is quota-blocked right now, so MemroOS used the local agent context instead of dropping the room turn."
    : "The live model provider did not return a usable turn, so MemroOS used the local agent context instead of dropping the room turn.";

  if (isStandup) {
    return [
      `${displayName} local check-in`,
      providerLine,
      `Yesterday: no live model transcript was available for this turn; ${displayName} is still present in the MemroOS room roster as a ${platform} agent.`,
      `Today: keep the dispatch workflow moving, verify the chat runtime, and surface any provider/runtime failures as explicit operational status.`,
      `Blocked: ${reason}.`,
      `Next: restore provider quota or switch this agent to an enabled runtime; until then this local fallback keeps the group room usable and auditable from ${source}.`,
    ].join("\n");
  }

  return [
    `${displayName} local response`,
    providerLine,
    `I could not complete the live model turn because: ${reason}.`,
    `MemroOS still has ${source} for this agent. Please treat this as an operational fallback, not a generated provider response.`,
  ].join("\n");
}

function enqueueText(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, text: string) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
}

function streamTextResponse(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      enqueueText(controller, encoder, text);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildOpenCodePrompt(systemPrompt: string, messages: ChatMessage[]): string {
  const transcript = messages
    .map((message) => `${message.role === "user" ? "Luis" : "Assistant"}: ${message.content}`)
    .join("\n\n");

  return [
    systemPrompt,
    "\n\n## Conversation",
    transcript,
    "\n\nReply directly to Luis as the selected agent. Keep the answer concise.",
  ].join("");
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function reserveOpenCodeSlot(): OpenCodeReservation {
  if (activeOpenCodeRuns >= OPENCODE_MAX_CONCURRENT) {
    return {
      ok: false,
      error: `OpenCode chat runner is busy (${activeOpenCodeRuns}/${OPENCODE_MAX_CONCURRENT}). Try again after the active run finishes.`,
    };
  }

  activeOpenCodeRuns += 1;
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      activeOpenCodeRuns = Math.max(0, activeOpenCodeRuns - 1);
    },
  };
}

function processTreeRssBytes(rootPid: number): Promise<number> {
  return new Promise((resolve) => {
    execFile("/bin/ps", ["-axo", "pid=,ppid=,rss="], { timeout: 2_000 }, (error, stdout) => {
      if (error) {
        resolve(0);
        return;
      }

      const childrenByParent = new Map<number, number[]>();
      const rssByPid = new Map<number, number>();
      for (const line of stdout.split("\n")) {
        const [pidRaw, ppidRaw, rssRaw] = line.trim().split(/\s+/);
        const pid = Number.parseInt(pidRaw, 10);
        const ppid = Number.parseInt(ppidRaw, 10);
        const rssKb = Number.parseInt(rssRaw, 10);
        if (!Number.isFinite(pid) || !Number.isFinite(ppid) || !Number.isFinite(rssKb)) continue;

        rssByPid.set(pid, rssKb * 1024);
        const siblings = childrenByParent.get(ppid) ?? [];
        siblings.push(pid);
        childrenByParent.set(ppid, siblings);
      }

      let total = 0;
      const seen = new Set<number>();
      const stack = [rootPid];
      while (stack.length > 0) {
        const pid = stack.pop();
        if (!pid || seen.has(pid)) continue;

        seen.add(pid);
        total += rssByPid.get(pid) ?? 0;
        stack.push(...(childrenByParent.get(pid) ?? []));
      }

      resolve(total);
    });
  });
}

function stopProcessGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process may have already exited.
    }
  }
}

function streamOpenCodeResponse(params: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  runtime: Extract<ChatRuntime, { runner: "opencode" }>;
  systemPrompt: string;
  messages: ChatMessage[];
}) {
  const { controller, encoder, runtime, systemPrompt, messages } = params;
  const reservation = reserveOpenCodeSlot();
  if (!reservation.ok) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: reservation.error })}\n\n`));
    controller.close();
    return;
  }

  const prompt = buildOpenCodePrompt(systemPrompt, messages);
  const child = spawn(OPENCODE_BIN, ["run", "--model", runtime.model, "--dir", process.cwd(), prompt], {
    detached: true,
    env: { ...process.env, NO_COLOR: "1", OPENCODE_DISABLE_TUI: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  let stoppedForMemory = false;
  const timeout = setTimeout(() => {
    if (!child.pid) return;
    stopProcessGroup(child.pid, "SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && child.pid) stopProcessGroup(child.pid, "SIGKILL");
    }, OPENCODE_KILL_GRACE_MS);
  }, Number(process.env.MEMROOS_CHAT_TIMEOUT_MS ?? 90_000));
  const rssMonitor = setInterval(async () => {
    if (!child.pid || child.exitCode !== null || stoppedForMemory) return;
    const rssBytes = await processTreeRssBytes(child.pid);
    if (rssBytes <= OPENCODE_MAX_RSS_BYTES) return;

    stoppedForMemory = true;
    stopProcessGroup(child.pid, "SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && child.pid) stopProcessGroup(child.pid, "SIGKILL");
    }, OPENCODE_KILL_GRACE_MS);
  }, OPENCODE_RSS_POLL_MS);

  child.stdout.on("data", (chunk: Buffer) => {
    const text = stripAnsi(chunk.toString("utf-8"));
    if (text) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf-8");
    if (stderr.length > 2000) stderr = stderr.slice(-2000);
  });

  child.on("error", (err) => {
    clearTimeout(timeout);
    clearInterval(rssMonitor);
    reservation.release();
    recordChatRuntimeFailure(runtime, err.message);
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
    controller.close();
  });

  child.on("close", (code, signal) => {
    clearTimeout(timeout);
    clearInterval(rssMonitor);
    reservation.release();
    if (stoppedForMemory) {
      const rssMb = Math.round(OPENCODE_MAX_RSS_BYTES / 1024 / 1024);
      const error = `OpenCode chat runner exceeded ${rssMb}MB RSS and was stopped.`;
      recordChatRuntimeFailure(runtime, error);
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error })}\n\n`));
    } else if (code === 0) {
      recordChatRuntimeSuccess(runtime);
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    } else {
      const detail = signal ? `chat runner stopped (${signal})` : `chat runner exited with code ${code}`;
      const cleanStderr = stripAnsi(stderr).trim();
      const error = cleanStderr || detail;
      recordChatRuntimeFailure(runtime, error);
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error })}\n\n`));
    }
    controller.close();
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as ChatRequestBody;

  const { message, agentId = "ceo", history = [] } = body;

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "message required" }), { status: 400 });
  }

  if (isMemoryDoctorCommand(message)) {
    const diagnostic = buildMemoryDoctorDiagnostic(getDb(), process.cwd());
    return streamTextResponse(formatMemoryDoctorReport(diagnostic));
  }

  const messages: ChatMessage[] = [
    ...history.slice(-10),
    { role: "user", content: message },
  ];

  try {
    recordOperatorQuestionTelemetry({ body, agentId, message, history });
  } catch {
    // Chat delivery should not depend on telemetry storage.
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const context = await buildAgentContext(agentId);
        const plan = await resolveChatRuntimePlan(agentId, context);
        const failures: string[] = [];

        for (const runtime of plan.candidates) {
          const readiness = chatRuntimeStatus(runtime);
          if (readiness.status === "blocked") {
            failures.push(`${runtime.runner}/${runtime.model}: ${readiness.detail}`);
            continue;
          }

          if (runtime.runner === "opencode") {
            if (!OPENCODE_CHAT_ENABLED) {
              failures.push(`${runtime.runner}/${runtime.model}: OpenCode chat runner is disabled on this machine.`);
              continue;
            }

            streamOpenCodeResponse({
              controller,
              encoder,
              runtime,
              systemPrompt: context.systemPrompt,
              messages,
            });
            return;
          }

          try {
            const response = await client.messages.stream({
              model: runtime.model,
              max_tokens: 1024,
              system: context.systemPrompt,
              messages,
            });

            for await (const chunk of response) {
              if (
                chunk.type === "content_block_delta" &&
                chunk.delta.type === "text_delta"
              ) {
                const data = `data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`;
                controller.enqueue(encoder.encode(data));
              }
            }

            recordChatRuntimeSuccess(runtime);
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          } catch (error) {
            const reason = error instanceof Error ? error.message : "provider stream failed";
            recordChatRuntimeFailure(runtime, reason);
            failures.push(`${runtime.runner}/${runtime.model}: ${reason}`);
            if (!isProviderLimitError(reason)) continue;
          }
        }

        enqueueText(controller, encoder, buildLocalFallbackResponse({
          agentId,
          context,
          runtime: await resolveChatRuntime(agentId, context),
          messages,
          reason: failures.join(" | ") || "No chat runtime candidate was ready.",
        }));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

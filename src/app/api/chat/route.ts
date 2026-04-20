import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const client = new Anthropic();

const AGENT_CONFIGS_PATH =
  process.env.AGENT_CONFIGS_PATH ||
  `${process.env.HOME}/github/knowledge/agent-configs`;

async function tryRead(filePath: string, maxLines = 150): Promise<string | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    return lines.length > maxLines
      ? lines.slice(0, maxLines).join("\n") + "\n\n[...truncated]"
      : content;
  } catch {
    return null;
  }
}

async function buildAgentContext(agentId: string): Promise<string> {
  const dir = path.join(AGENT_CONFIGS_PATH, agentId);

  const [soul, memory, lessons, heartbeatState, heartbeat] = await Promise.all([
    tryRead(path.join(dir, "SOUL.md")),
    tryRead(path.join(dir, "MEMORY.md"), 80),
    tryRead(path.join(dir, "LESSONS.md"), 80),
    tryRead(path.join(dir, "HEARTBEAT_STATE.md"), 50),
    tryRead(path.join(dir, "HEARTBEAT.md"), 100),
  ]);

  if (!soul) {
    return `You are a helpful AI assistant embedded in Agent Kitchen. Keep responses concise.`;
  }

  // Strip frontmatter from SOUL.md
  const soulBody = soul.replace(/^---[\s\S]*?---\n?/, "").trim();

  const sections: string[] = [soulBody];

  if (heartbeatState) {
    sections.push(`\n\n## Current Status\n${heartbeatState}`);
  }

  if (heartbeat && !heartbeatState) {
    sections.push(`\n\n## Recent Activity\n${heartbeat}`);
  }

  if (memory) {
    sections.push(`\n\n## Memory\n${memory}`);
  }

  if (lessons) {
    sections.push(`\n\n## Lessons Learned\n${lessons}`);
  }

  sections.push(
    `\n\n## Instructions\nYou are being spoken to directly by Luis Calderon, who built and runs you. ` +
    `Answer as yourself — your actual role, your current work, your real situation. ` +
    `Be direct and honest. Keep responses concise.`
  );

  return sections.join("");
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    message: string;
    agentId?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  const { message, agentId = "ceo", history = [] } = body;

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "message required" }), { status: 400 });
  }

  const systemPrompt = await buildAgentContext(agentId);

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history.slice(-10),
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.stream({
          model: process.env.CONSOLIDATION_MODEL ?? "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: systemPrompt,
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

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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

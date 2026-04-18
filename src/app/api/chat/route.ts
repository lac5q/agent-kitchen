import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const client = new Anthropic();

// System prompts per agent
const AGENT_PROMPTS: Record<string, string> = {
  kitchen: `You are the Kitchen Floor assistant — a helpful AI embedded in the Agent Kitchen dashboard.
You have deep knowledge of the agents, skills, knowledge collections, and real-time metrics visible on the dashboard.
Help the user understand what's happening across their agent fleet, interpret metrics, and navigate their knowledge base.
Keep responses concise and actionable. Use markdown for code or lists when helpful.`,

  flow: `You are the Flow assistant — an AI specializing in agent coordination and orchestration.
You help design agent workflows, debug coordination issues between agents, analyze the hive mind activity feed,
and suggest improvements to how agents collaborate. You are familiar with the Pipecat, GSD, and OpenClaw ecosystems.
Keep responses concise and technical. Use markdown for code or lists when helpful.`,

  general: `You are a helpful AI assistant embedded in Agent Kitchen.
You help with any questions about AI agents, skills, knowledge management, and dashboard analytics.
Keep responses concise and actionable.`,
};

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    message: string;
    agentId?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  const { message, agentId = "kitchen", history = [] } = body;

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "message required" }), { status: 400 });
  }

  const systemPrompt = AGENT_PROMPTS[agentId] ?? AGENT_PROMPTS.general;

  // Build messages array from history + new message
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history.slice(-10), // keep last 10 turns for context
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

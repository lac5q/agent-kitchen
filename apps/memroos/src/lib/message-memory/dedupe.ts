import crypto from "crypto";
import type { NormalizedPlatformMessage } from "./types";

function normalizePart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function contentHash(content: string): string {
  return `sha256:${sha256Hex(content.replace(/\s+/g, " ").trim())}`;
}

export function buildMessageMemoryDedupeKey(message: NormalizedPlatformMessage): string {
  const stableParts = [
    normalizePart(message.provider),
    normalizePart(message.workspaceId),
    normalizePart(message.channelId),
    normalizePart(message.threadId ?? message.messageId),
    normalizePart(message.messageId),
  ];
  return `msgmem:${sha256Hex(stableParts.join("\u001f"))}`;
}

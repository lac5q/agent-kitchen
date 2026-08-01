/**
 * Copyable invite email for Team admins (no SendGrid — draft only).
 * Long-lived MCP bearer tokens must never appear in this draft.
 */
import { isCordantPublicUrl } from "@/lib/cowork-connector";

export type InviteEmailDraftOptions = {
  /** Force Cowork connector step; default auto-on for Cordant invite URLs. */
  includeCowork?: boolean;
};

export function buildInviteEmailDraft(
  inviteUrl: string,
  options: InviteEmailDraftOptions = {}
): string {
  const includeCowork = options.includeCowork ?? isCordantPublicUrl(inviteUrl);
  const lines = [
    "You're invited to MemRoOS (Cordant).",
    "",
    "Three easy steps:",
    "",
    `1) Open this link: ${inviteUrl}`,
    "2) Create your account (name, email, password).",
    "3) Pick the AI tools you use (Claude Code, Claude Cowork, Cursor, etc.).",
    "",
  ];

  if (includeCowork) {
    lines.push(
      "If you use Claude Cowork (not Claude Code):",
      "- On the Connect page, choose Claude Cowork.",
      "- Tap Connect in Claude — you should not need a token or Terminal command.",
      "- Connector URL (for your admin if not listed yet): https://memroos-cordant.epiloguecapital.com/mcp",
      ""
    );
  }

  lines.push(
    "For Claude Code / Cursor / other harnesses, run the one-line commands shown on the page.",
    "",
    "That connects your tools to our MemRoOS server so they can save and find shared memory.",
    "",
    "If a command stops working, use Refresh on the page for a new one."
  );

  return lines.join("\n");
}

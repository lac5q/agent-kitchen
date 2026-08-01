/**
 * Invite email body. Used both for the Team admin's copy/paste draft and as
 * the text part of the email MemRoOS sends directly (`@/lib/email/send`).
 * Long-lived MCP bearer tokens must never appear in this draft.
 */
import { isCordantPublicUrl } from "@/lib/cowork-connector";

export type InviteEmailDraftOptions = {
  /** Force Cowork connector step; default auto-on for Cordant invite URLs. */
  includeCowork?: boolean;
};

export const INVITE_EMAIL_SUBJECT = "You're invited to MemRoOS";

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
    "2) Create your account — tap Continue with Google, or use a password instead.",
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * HTML alternative for the sent email. Same content as the plain-text draft —
 * a paragraph per blank-line-delimited block, with the invite URL as the only
 * link. Inline styles only: every mail client strips <style> blocks.
 */
export function buildInviteEmailHtml(
  inviteUrl: string,
  options: InviteEmailDraftOptions = {}
): string {
  const safeUrl = escapeHtml(inviteUrl);
  const body = buildInviteEmailDraft(inviteUrl, options)
    .split("\n\n")
    .map((block) => {
      const html = escapeHtml(block).replace(/\n/g, "<br />");
      // Re-link the invite URL after escaping so the anchor href stays exact.
      return `<p style="margin:0 0 16px">${html.replace(
        safeUrl,
        `<a href="${safeUrl}" style="color:#a8392c">${safeUrl}</a>`
      )}</p>`;
    })
    .join("");

  return [
    `<div style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f0f0e;background:#fafaf7;padding:24px">`,
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4dd;padding:28px">`,
    `<p style="margin:0 0 20px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#a8392c">MemRoOS</p>`,
    body,
    `<p style="margin:24px 0 0;font-size:12px;color:#6e6e67">This invitation expires in 72 hours and can only be used once.</p>`,
    `</div></div>`,
  ].join("");
}

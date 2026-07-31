/**
 * Copyable invite email for Team admins (no SendGrid — draft only).
 */
export function buildInviteEmailDraft(inviteUrl: string): string {
  return [
    "You're invited to MemRoOS (Cordant).",
    "",
    "Three easy steps:",
    "",
    `1) Open this link: ${inviteUrl}`,
    "2) Create your account (name, email, password).",
    "3) Pick the AI tools you use (Claude Code, Cursor, etc.) and run the one-line commands shown on the page.",
    "",
    "That connects your tools to our MemRoOS server so they can save and find shared memory.",
    "",
    "If a command stops working, use Refresh on the page for a new one.",
  ].join("\n");
}

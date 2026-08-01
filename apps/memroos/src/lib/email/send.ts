/**
 * Transactional email for the operator console.
 *
 * Transport is SendGrid, chosen because `SENDGRID_API_KEY` + `MEMROOS_EMAIL_FROM`
 * are already provisioned in `$MEMROOS_ROOT/.env` on both hosts for the health
 * check and scheduler-liveness alerts (`scripts/memroos-health-check.sh`), and
 * compose passes that file straight through (`env_file: .env`). No new vendor,
 * no new account, no new secret to rotate.
 *
 * Every failure mode is non-throwing and typed. An invite must still be
 * generated and copyable when mail is down or unconfigured — email is an
 * accelerator for the copy/paste path, never a dependency of it.
 */

const SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

export type EmailSendResult =
  /** Handed off to SendGrid (2xx). */
  | { status: "sent" }
  /** No API key / from address on this host — caller falls back to copy/paste. */
  | { status: "not_configured" }
  /** MEMROOS_EMAIL_DRY_RUN is on: payload built and validated, nothing sent. */
  | { status: "dry_run" }
  | { status: "error"; reason: string };

export interface EmailConfig {
  apiKey: string;
  from: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML alternative; SendGrid picks the last matching MIME part. */
  html?: string;
}

/**
 * `MEMROOS_EMAIL_FROM` must be a verified SendGrid sender or the API accepts
 * the call and silently drops the mail, so an unset value is treated as
 * unconfigured rather than defaulted to something plausible.
 */
export function getEmailConfig(): EmailConfig | null {
  const apiKey = (process.env.SENDGRID_API_KEY ?? "").trim();
  const from = (process.env.MEMROOS_EMAIL_FROM ?? "").trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export function isEmailDryRun(): boolean {
  const raw = (process.env.MEMROOS_EMAIL_DRY_RUN ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true";
}

/** Deliberately strict: a bad address must fail here, not inside SendGrid. */
export function isValidEmailAddress(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  if (/\s/.test(trimmed)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(trimmed);
}

export function buildSendGridPayload(config: EmailConfig, message: EmailMessage) {
  const content: Array<{ type: string; value: string }> = [
    { type: "text/plain", value: message.text },
  ];
  // SendGrid requires text/plain first and renders the last part it can.
  if (message.html) content.push({ type: "text/html", value: message.html });

  return {
    personalizations: [{ to: [{ email: message.to.trim() }] }],
    from: { email: config.from },
    subject: message.subject,
    content,
  };
}

/**
 * Never throws and never logs the message body — invite URLs are
 * bearer-equivalent secrets and must not reach container logs.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  if (!isValidEmailAddress(message.to)) {
    return { status: "error", reason: "invalid recipient address" };
  }

  const config = getEmailConfig();
  if (!config) return { status: "not_configured" };

  const payload = buildSendGridPayload(config, message);
  if (isEmailDryRun()) return { status: "dry_run" };

  try {
    const res = await fetch(SENDGRID_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Status only. SendGrid echoes request detail in the body, and the
      // request contains the invite URL.
      return { status: "error", reason: `sendgrid responded ${res.status}` };
    }
    return { status: "sent" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown transport error";
    return { status: "error", reason };
  }
}

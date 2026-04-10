/**
 * Strips log formatting noise from activity event messages.
 * Pure regex transforms — no LLM involvement (per D-08).
 */
export function cleanMessage(raw: string): string {
  let msg = raw;
  // Strip === delimiters (banner lines and separator lines)
  msg = msg.replace(/={3,}/g, "").trim();
  // Strip --- delimiters
  msg = msg.replace(/-{3,}/g, "").trim();
  // Strip leading [timestamp] bracket form: [2026-04-09 14:33:22]
  msg = msg.replace(/^\[\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\]\s*/g, "");
  // Strip trailing/mid-string ISO-8601 timestamps
  msg = msg.replace(/\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?\s*/g, " ").trim();
  // Strip lone noise words (entire message is just this word)
  if (/^(Starting|Complete|cycle|Done|Running)\.?$/i.test(msg)) return "";
  return msg.trim();
}

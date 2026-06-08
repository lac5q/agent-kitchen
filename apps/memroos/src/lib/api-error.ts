/**
 * apiError - canonical API error response helper.
 * Returns Response.json({ ok: false, error: message }, { status }).
 * Use this in Next.js API route catch blocks so clients receive a consistent
 * { ok: false, error: string } envelope.
 */
export function apiError(status: number, message: string): Response {
  return Response.json({ ok: false, error: message }, { status });
}

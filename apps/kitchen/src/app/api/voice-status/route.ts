import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/voice-status
 *
 * Proxies the Python voice server health endpoint (port 7861) to the dashboard.
 * Returns graceful fallback JSON when the Python server is not running.
 *
 * Response shape (mirrors health.py):
 *   { active: boolean, session_id: string|null, started_at: string|null,
 *     duration_secs: number|null, error?: string }
 *
 * No authentication needed — single-user local tool per PROJECT.md.
 */
export async function GET(_req: NextRequest) {
  try {
    const res = await fetch('http://localhost:7861/health', { cache: 'no-store' });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({
      active: false,
      session_id: null,
      started_at: null,
      duration_secs: null,
      error: 'voice server unavailable',
    });
  }
}

export const dynamic = 'force-dynamic';

const PAPERCLIP_BASE_URL = process.env.PAPERCLIP_BASE_URL || '';
const PAPERCLIP_BUDGET_PATH = process.env.PAPERCLIP_BUDGET_PATH || '/api/budget';

// ---------------------------------------------------------------------------
// GET /api/paperclip/budget
// ---------------------------------------------------------------------------

/**
 * Phase 146 (FLEET-19): Proxy a thin budget summary from Paperclip's budget
 * surface so the MemroOS operator can see company/agent/project spend without
 * leaving the console.
 *
 * HARD-STOP OWNERSHIP (FLEET-19): The monthly budget hard-stop (auto-pause at
 * 100% utilization) is **delegated to Paperclip**. MemroOS does NOT
 * re-implement it. This endpoint is read-only and for operator visibility
 * only — it never pauses agents, modifies budgets, or overrides Paperclip's
 * enforcement.
 *
 * When Paperclip is unconfigured (no PAPERCLIP_BASE_URL), the endpoint
 * degrades gracefully and returns a 503 with a clear message — it never
 * fabricates budget data.
 */

import type { PaperclipBudgetSummary } from '@/types';

interface UpstreamBudgetPayload {
  companyId?: string;
  scope?: string;
  scopeId?: string | null;
  spent?: number;
  limit?: number;
  status?: string;
  asOf?: string;
}

function normalizeScope(raw: string | undefined): PaperclipBudgetSummary['scope'] {
  const lower = (raw ?? '').toLowerCase();
  if (lower === 'agent') return 'agent';
  if (lower === 'project') return 'project';
  return 'company';
}

function normalizeStatus(raw: string | undefined): PaperclipBudgetSummary['status'] {
  const lower = (raw ?? '').toLowerCase();
  if (lower === 'hard_stop' || lower === 'hardstop' || lower === 'hard-stop') return 'hard_stop';
  if (lower === 'warning' || lower === 'warn') return 'warning';
  return 'ok';
}

export async function GET() {
  const baseUrl = process.env.PAPERCLIP_BASE_URL || PAPERCLIP_BASE_URL;
  const budgetPath = process.env.PAPERCLIP_BUDGET_PATH || PAPERCLIP_BUDGET_PATH;

  if (!baseUrl) {
    return Response.json(
      {
        error: 'Paperclip service not configured',
        hardStopOwner: 'paperclip',
      },
      { status: 503 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const upstreamRes = await fetch(`${baseUrl}${budgetPath}`, {
      signal: controller.signal,
    });
    if (!upstreamRes.ok) {
      return Response.json(
        {
          error: `Upstream budget query failed: ${upstreamRes.status}`,
          hardStopOwner: 'paperclip',
        },
        { status: 502 }
      );
    }

    const payload = (await upstreamRes.json()) as UpstreamBudgetPayload;

    const spent = typeof payload.spent === 'number' ? payload.spent : 0;
    const limit = typeof payload.limit === 'number' ? payload.limit : 0;
    const utilization = limit > 0 ? spent / limit : 0;

    const summary: PaperclipBudgetSummary = {
      companyId: String(payload.companyId ?? ''),
      scope: normalizeScope(payload.scope),
      scopeId: payload.scopeId != null ? String(payload.scopeId) : null,
      spent,
      limit,
      utilization,
      status: normalizeStatus(payload.status),
      asOf: String(payload.asOf ?? new Date().toISOString()),
      hardStopOwner: 'paperclip',
    };

    return Response.json({ summary, hardStopOwner: 'paperclip' });
  } catch (err) {
    return Response.json(
      {
        error: `Upstream budget unreachable: ${(err as Error).message}`,
        hardStopOwner: 'paperclip',
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

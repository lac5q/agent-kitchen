import { getDb } from './db';

// Use globalThis to survive Next.js hot-reload module re-evaluation.
// _consolidationInterval holds the NodeJS.Timeout so we can clear it if needed.
declare global {
  // eslint-disable-next-line no-var
  var _consolidationInterval: ReturnType<typeof setInterval> | undefined;
}

const ALLOWED_INSIGHT_TYPES = new Set(['pattern', 'contradiction', 'summary']);
const PROVIDER_BACKOFF_MINUTES = Number(process.env.CONSOLIDATION_PROVIDER_BACKOFF_MINUTES ?? 60);

export interface ConsolidationRunResult {
  status: 'disabled' | 'skipped' | 'completed' | 'failed';
  runId?: number;
  reason?: string;
  backoffUntil?: string;
  batchSize?: number;
  insightsWritten?: number;
}

const CONSOLIDATION_PROMPT = `You are analyzing a batch of agent conversation memory fragments.
Extract key insights from these messages and return a JSON array of insight objects.
Each object must have exactly two fields: "insight_type" (one of: "pattern", "contradiction", "summary") and "content" (a concise description).
Return ONLY the JSON array, no other text.

Messages:
`;

/**
 * Runs a single consolidation cycle:
 * - Selects up to 50 unconsolidated messages
 * - Sends them to Ollama for insight extraction
 * - Writes insights to memory_meta_insights
 * - Marks messages as consolidated
 */
export async function runConsolidation(): Promise<ConsolidationRunResult> {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const consolidationModel = process.env.CONSOLIDATION_MODEL ?? 'qwen2.5:3b';

  const db = getDb();
  const backoff = currentProviderBackoff(db);
  if (backoff) {
    console.warn(`[consolidation] provider rate limited -- skipping until ${backoff.backoffUntil}`);
    return {
      status: 'skipped',
      reason: 'provider_rate_limited',
      backoffUntil: backoff.backoffUntil,
    };
  }

  // Create run record
  const runId = db
    .prepare('INSERT INTO memory_consolidation_runs(batch_size) VALUES(0)')
    .run().lastInsertRowid as number;

  try {
    // Select unconsolidated batch (MEMX-BATCH: 10 fits qwen2.5:3b's reliable JSON regime; 50 returned prose)
    const batch = db
      .prepare('SELECT id, content FROM messages WHERE consolidated = 0 LIMIT 10')
      .all() as { id: number; content: string }[];

    if (batch.length === 0) {
      db.prepare(
        "UPDATE memory_consolidation_runs SET status='completed', batch_size=0, insights_written=0, completed_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?"
      ).run(runId);
      return { status: 'completed', runId, batchSize: 0, insightsWritten: 0 };
    }

    // Build prompt from batch
    const batchText = batch
      .map((m, i) => `[${i + 1}] ${m.content.slice(0, 500)}`)
      .join('\n');

    // Call Ollama via native API
    const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: consolidationModel,
        messages: [{ role: 'user', content: CONSOLIDATION_PROMPT + batchText }],
        stream: false,
        options: { num_predict: 256 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { message?: { content?: string } };
    const rawText = data.message?.content ?? '';

    // Strip markdown code fences, then extract the first JSON array.
    // Small local models often emit prose around the JSON, so we cannot rely
    // on JSON.parse(cleanedText) alone. Walk the string and locate the first
    // balanced [ ... ] block, then parse that. Falls back to the cleaned text
    // when no bracket pair is present.
    const cleanedText = rawText.replace(/```(?:json)?\n?/gi, '').trim();
    const extractFirstJsonArray = (input: string): string | null => {
      const start = input.indexOf('[');
      if (start === -1) return null;
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = start; i < input.length; i++) {
        const ch = input[i];
        if (inString) {
          if (escape) { escape = false; continue; }
          if (ch === '\\') { escape = true; continue; }
          if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '[') depth++;
        else if (ch === ']') {
          depth--;
          if (depth === 0) return input.slice(start, i + 1);
        }
      }
      return null;
    };

    // Parse insights with strict validation
    let insights: Array<{ insight_type: string; content: string }> = [];
    const jsonCandidate = extractFirstJsonArray(cleanedText) ?? cleanedText;
    try {
      const parsed = JSON.parse(jsonCandidate);
      if (Array.isArray(parsed)) {
        insights = parsed.filter(
          (item) =>
            item &&
            typeof item.insight_type === 'string' &&
            ALLOWED_INSIGHT_TYPES.has(item.insight_type) &&
            typeof item.content === 'string' &&
            item.content.length > 0
        );
      } else {
        console.warn('[consolidation] LLM response parsed but is not a JSON array — writing run with 0 insights');
      }
    } catch (parseErr) {
      const preview = cleanedText.slice(0, 200).replace(/\s+/g, ' ');
      console.error(
        `[consolidation] Failed to parse LLM response as JSON -- writing run with 0 insights (preview: "${preview}")`
      );
    }

    // Write insights to DB
    const sourceIds = JSON.stringify(batch.map((m) => m.id));
    const insertInsight = db.prepare(
      'INSERT INTO memory_meta_insights(run_id, insight_type, content, source_ids) VALUES(?,?,?,?)'
    );
    for (const insight of insights) {
      insertInsight.run(runId, insight.insight_type, insight.content, sourceIds);
    }

    // Mark batch as consolidated — but only when the LLM response actually
    // produced extractable insights. Without this gate, parse failures silently
    // mark messages consolidated=1 with insights_written=0, advancing the
    // consolidation cursor over rows that never made it into memory_meta_insights.
    if (insights.length > 0) {
      const placeholders = batch.map(() => '?').join(',');
      db.prepare(
        `UPDATE messages SET consolidated = 1 WHERE id IN (${placeholders})`
      ).run(...batch.map((m) => m.id));
    } else {
      console.warn(`[consolidation] Skipping consolidated=1 mark (insights.length=0) for batch of ${batch.length} messages`);
    }

    // Update run record
    db.prepare(
      "UPDATE memory_consolidation_runs SET status='completed', batch_size=?, insights_written=?, completed_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?"
    ).run(batch.length, insights.length, runId);
    return { status: 'completed', runId, batchSize: batch.length, insightsWritten: insights.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[consolidation] Run failed:', message);
    db.prepare(
      "UPDATE memory_consolidation_runs SET status='failed', error_message=? WHERE id=?"
    ).run(message, runId);
    return { status: 'failed', runId, reason: message };
  }
}

function currentProviderBackoff(db: ReturnType<typeof getDb>): { backoffUntil: string } | null {
  if (!Number.isFinite(PROVIDER_BACKOFF_MINUTES) || PROVIDER_BACKOFF_MINUTES <= 0) return null;
  const row = db
    .prepare(
      "SELECT started_at, error_message FROM memory_consolidation_runs WHERE status='failed' ORDER BY id DESC LIMIT 1"
    )
    .get() as { started_at: string; error_message: string | null } | undefined;
  if (!row?.error_message || !isProviderRateLimit(row.error_message)) return null;

  const startedAt = new Date(row.started_at).getTime();
  if (!Number.isFinite(startedAt)) return null;
  const backoffUntilMs = startedAt + PROVIDER_BACKOFF_MINUTES * 60_000;
  if (Date.now() >= backoffUntilMs) return null;
  return { backoffUntil: new Date(backoffUntilMs).toISOString() };
}

function isProviderRateLimit(message: string): boolean {
  return /(^|\b)(429|rate[_ -]?limit|usage limit exceeded)(\b|$)/i.test(message);
}

/**
 * Starts the consolidation scheduler (runs immediately, then every 15 min).
 * Uses globalThis to survive Next.js hot-reload module re-evaluation so only
 * one interval runs per process lifetime.
 */
export function startConsolidationScheduler(): void {
  if (typeof globalThis._consolidationInterval !== 'undefined') return;
  console.log('[consolidation] scheduler started (interval: 15m)');
  runConsolidation().catch(console.error);
  globalThis._consolidationInterval = setInterval(() => {
    runConsolidation().catch(console.error);
  }, 15 * 60 * 1000);
}

/**
 * Stops the consolidation scheduler and clears the global reference.
 * Useful for tests and graceful shutdown.
 */
export function stopConsolidationScheduler(): void {
  if (typeof globalThis._consolidationInterval !== 'undefined') {
    clearInterval(globalThis._consolidationInterval);
    globalThis._consolidationInterval = undefined;
  }
}

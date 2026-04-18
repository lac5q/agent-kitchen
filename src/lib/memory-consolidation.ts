import Anthropic from '@anthropic-ai/sdk';
import { getDb } from './db';

let _started = false;

const ALLOWED_INSIGHT_TYPES = new Set(['pattern', 'contradiction', 'summary']);

const CONSOLIDATION_PROMPT = `You are analyzing a batch of agent conversation memory fragments.
Extract key insights from these messages and return a JSON array of insight objects.
Each object must have exactly two fields: "insight_type" (one of: "pattern", "contradiction", "summary") and "content" (a concise description).
Return ONLY the JSON array, no other text.

Messages:
`;

/**
 * Runs a single consolidation cycle:
 * - Selects up to 50 unconsolidated messages
 * - Sends them to Claude for insight extraction
 * - Writes insights to memory_meta_insights
 * - Marks messages as consolidated
 *
 * Security: T-23-03, T-23-05, T-23-06
 */
export async function runConsolidation(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[consolidation] ANTHROPIC_API_KEY not set -- consolidation disabled');
    return;
  }

  const db = getDb();

  // Create run record
  const runId = db
    .prepare('INSERT INTO memory_consolidation_runs(batch_size) VALUES(0)')
    .run().lastInsertRowid as number;

  try {
    // Select unconsolidated batch
    const batch = db
      .prepare('SELECT id, content FROM messages WHERE consolidated = 0 LIMIT 50')
      .all() as { id: number; content: string }[];

    if (batch.length === 0) {
      db.prepare(
        "UPDATE memory_consolidation_runs SET status='completed', batch_size=0, insights_written=0, completed_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?"
      ).run(runId);
      return;
    }

    // Build prompt from batch
    const batchText = batch
      .map((m, i) => `[${i + 1}] ${m.content.slice(0, 500)}`)
      .join('\n');

    // Call Anthropic
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: CONSOLIDATION_PROMPT + batchText }],
    });

    const rawText = response.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: 'text'; text: string }).text)
      .join('');

    // Strip markdown code fences
    const cleanedText = rawText.replace(/```(?:json)?\n?/gi, '').trim();

    // Parse insights with strict validation
    let insights: Array<{ insight_type: string; content: string }> = [];
    try {
      const parsed = JSON.parse(cleanedText);
      if (Array.isArray(parsed)) {
        insights = parsed.filter(
          (item) =>
            item &&
            typeof item.insight_type === 'string' &&
            ALLOWED_INSIGHT_TYPES.has(item.insight_type) &&
            typeof item.content === 'string' &&
            item.content.length > 0
        );
      }
    } catch {
      console.error('[consolidation] Failed to parse LLM response as JSON -- writing run with 0 insights');
    }

    // Write insights to DB
    const sourceIds = JSON.stringify(batch.map((m) => m.id));
    const insertInsight = db.prepare(
      'INSERT INTO memory_meta_insights(run_id, insight_type, content, source_ids) VALUES(?,?,?,?)'
    );
    for (const insight of insights) {
      insertInsight.run(runId, insight.insight_type, insight.content, sourceIds);
    }

    // Mark batch as consolidated
    const placeholders = batch.map(() => '?').join(',');
    db.prepare(
      `UPDATE messages SET consolidated = 1 WHERE id IN (${placeholders})`
    ).run(...batch.map((m) => m.id));

    // Update run record
    db.prepare(
      "UPDATE memory_consolidation_runs SET status='completed', batch_size=?, insights_written=?, completed_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?"
    ).run(batch.length, insights.length, runId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[consolidation] Run failed:', message);
    db.prepare(
      "UPDATE memory_consolidation_runs SET status='failed', error_message=? WHERE id=?"
    ).run(message, runId);
  }
}

/**
 * Starts the consolidation scheduler (runs immediately, then every 15 min).
 * Module-level _started guard prevents double-start.
 */
export function startConsolidationScheduler(): void {
  if (_started) return;
  _started = true;
  console.log('[consolidation] scheduler started (interval: 15m)');
  runConsolidation().catch(console.error);
  setInterval(() => {
    runConsolidation().catch(console.error);
  }, 15 * 60 * 1000);
}

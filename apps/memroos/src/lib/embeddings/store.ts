/**
 * message_embeddings store — low-level helpers for reading and writing embedding rows.
 *
 * All functions take an explicit `db` argument so they are testable with a fresh handle.
 * Vectors are stored as packed Float32 BLOBs (4 bytes per element) to keep the table compact.
 * No Qdrant writes happen here — message embeddings live exclusively in conversations.db (D-02).
 */

import type Database from "better-sqlite3";

export interface EmbeddingProvenance {
  artifactId?: string | null;
  sourceSpan?: string | null;
  modality?: string;
  modelVersion?: string | null;
  labelVersion?: number;
}

/**
 * Pack a number[] into a Float32Array BLOB (Buffer).
 * Each element occupies 4 bytes in little-endian IEEE 754 format.
 */
function packVector(vector: number[]): Buffer {
  const float32 = new Float32Array(vector);
  return Buffer.from(float32.buffer);
}

/**
 * Unpack a Buffer (Float32 BLOB) back into a number[].
 */
function unpackVector(buf: Buffer): number[] {
  const float32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(float32);
}

/**
 * Upsert an embedding row for a given message.
 *
 * Uses INSERT ... ON CONFLICT(message_id) DO UPDATE so a second call for
 * the same message_id replaces the row without creating a duplicate.
 */
export function upsertEmbedding(
  db: Database.Database,
  messageId: number,
  vector: number[],
  model: string,
  provenance: EmbeddingProvenance = {}
): void {
  const blob = packVector(vector);
  db.prepare(
    `INSERT INTO message_embeddings(
       message_id, model, dim, vector, artifact_id, source_span, modality, model_version, label_version
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(message_id) DO UPDATE SET
       model  = excluded.model,
       dim    = excluded.dim,
       vector = excluded.vector,
       artifact_id = excluded.artifact_id,
       source_span = excluded.source_span,
       modality = excluded.modality,
       model_version = excluded.model_version,
       label_version = excluded.label_version,
       created_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`
  ).run(
    messageId,
    model,
    vector.length,
    blob,
    provenance.artifactId ?? null,
    provenance.sourceSpan ?? null,
    provenance.modality ?? "text",
    provenance.modelVersion ?? model,
    provenance.labelVersion ?? 1
  );
}

/**
 * Retrieve the stored embedding vector for a message.
 *
 * Returns the vector as number[] or null if no row exists.
 */
export function getEmbedding(
  db: Database.Database,
  messageId: number
): number[] | null {
  const row = db
    .prepare("SELECT vector FROM message_embeddings WHERE message_id = ?")
    .get(messageId) as { vector: Buffer } | undefined;

  if (!row) return null;
  return unpackVector(row.vector);
}

/**
 * Return message IDs that have no corresponding embedding row.
 *
 * Results are ordered by message id DESC (newest first) so the background
 * job embeds the most recent messages before older ones. Capped at `limit`.
 */
export function messagesNeedingEmbedding(
  db: Database.Database,
  limit: number
): number[] {
  const rows = db
    .prepare(
      `SELECT m.id
       FROM messages m
       LEFT JOIN message_embeddings e ON e.message_id = m.id
       WHERE e.message_id IS NULL
         AND m.policy = 'indexable'
         AND m.visibility IN ('internal','public_safe','public_approved')
         AND length(trim(m.content, ' ' || char(9) || char(10) || char(13))) > 0
       ORDER BY m.id DESC
       LIMIT ?`
    )
    .all(limit) as { id: number }[];

  return rows.map((r) => r.id);
}

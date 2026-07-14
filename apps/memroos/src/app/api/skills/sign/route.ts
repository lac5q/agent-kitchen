/**
 * POST /api/skills/sign
 *
 * Signs a skill contract by name (or raw body) using the operator's local
 * Ed25519 keypair (apps/memroos/data/skill-signing-key.json). When the key
 * file is absent the route generates one and persists it before signing.
 *
 * Request body (one of two forms):
 *   { skill_name: "my-skill" }                            -- sign the latest
 *                                                          registry row for
 *                                                          that skill.
 *   { skill_name: "my-skill", source_harness: "claude" }   -- restrict to a
 *                                                          specific harness.
 *   { content: "---\nname: ...",
 *     source_harness: "claude" }                          -- sign raw content
 *                                                          without persisting.
 *
 * Returns the resulting provenance record:
 *   { ok, skill: { id?, name, source_harness, content_hash, signature,
 *                  signed_by, signed_at, public_key_fingerprint,
 *                  trust_level } }
 *
 * Auth: operator key or loopback (same gate as the import route).
 */

import { randomUUID } from "crypto";

import { buildSkillAuditEntry } from "@/lib/audit/skill-chain";
import { getDb } from "@/lib/db";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import {
  hashSkillContent,
  loadOrCreateOperatorKeyPair,
  signRawSkillBody,
} from "@/lib/skills/skill-signing";
import type Database from "better-sqlite3";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

interface RegistryRow {
  id: number;
  name: string;
  source_harness: string;
  content_hash: string | null;
  raw_body: string | null;
  signature: string | null;
  signed_by: string | null;
  signed_at: string | null;
  trust_level: string | null;
  public_key_fingerprint: string | null;
}

function loadRegistryRow(
  db: Database.Database,
  skill_name: string,
  source_harness?: string
): RegistryRow | null {
  if (source_harness) {
    const row = db
      .prepare<[string, string], RegistryRow>(
        `SELECT id, name, source_harness, content_hash, raw_body,
                signature, signed_by, signed_at, trust_level,
                public_key_fingerprint
           FROM skill_registry
          WHERE name = ? AND source_harness = ?
          ORDER BY imported_at DESC
          LIMIT 1`
      )
      .get(skill_name, source_harness);
    return row ?? null;
  }
  const row = db
    .prepare<[string], RegistryRow>(
      `SELECT id, name, source_harness, content_hash, raw_body,
              signature, signed_by, signed_at, trust_level,
              public_key_fingerprint
         FROM skill_registry
        WHERE name = ?
        ORDER BY imported_at DESC
        LIMIT 1`
    )
    .get(skill_name);
  return row ?? null;
}

export async function POST(request: Request) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return Response.json({ ok: false, error: "Body must be an object" }, { status: 400 });
  }

  const skillName = typeof body["skill_name"] === "string" ? body["skill_name"].trim() : "";
  const sourceHarness =
    typeof body["source_harness"] === "string" ? body["source_harness"].trim() : "";
  const rawContent = typeof body["content"] === "string" ? body["content"] : null;

  // We accept two modes:
  //   1. Look up an existing registry row by name (optional source_harness).
  //   2. Sign arbitrary raw content without touching the DB.
  if (!skillName && !rawContent) {
    return Response.json(
      {
        ok: false,
        error: "Provide either 'skill_name' or 'content' in the request body",
      },
      { status: 400 }
    );
  }

  let keyPair;
  try {
    keyPair = loadOrCreateOperatorKeyPair();
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: `Failed to load operator keypair: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }

  // Mode 2: sign raw content without persisting.
  if (!skillName && rawContent) {
    const contentHash = hashSkillContent(rawContent);
    const record = signRawSkillBody(rawContent, keyPair);
    return Response.json({
      ok: true,
      skill: {
        name: null,
        source_harness: sourceHarness || null,
        content_hash: contentHash,
        signature: record.signature,
        signed_by: record.signed_by,
        signed_at: record.signed_at,
        public_key_fingerprint: record.public_key_fingerprint,
        trust_level: "signed",
      },
    });
  }

  // Mode 1: sign an existing registry row.
  const db = getDb();
  const row = loadRegistryRow(db, skillName, sourceHarness || undefined);
  if (!row) {
    return Response.json(
      {
        ok: false,
        error: `Skill '${skillName}' not found in registry${sourceHarness ? ` for harness '${sourceHarness}'` : ""}`,
      },
      { status: 404 }
    );
  }
  if (!row.raw_body) {
    return Response.json(
      {
        ok: false,
        error: "Skill row has no raw_body to sign (was it imported with content?)",
      },
      { status: 422 }
    );
  }

  // Recompute the content hash from raw_body to ensure the stored hash matches
  // what we are about to sign — this is the same hash produced by the import
  // path so the resulting signature is byte-compatible with downstream
  // verification (VAL-SIGN-001, VAL-SIGN-002).
  const contentHash = hashSkillContent(row.raw_body);
  const record = signRawSkillBody(row.raw_body, keyPair);

  // Persist signature columns back to the registry row + audit atomically (VAL-038, VAL-039)
  try {
    db.transaction(() => {
      db.prepare(
        `UPDATE skill_registry
            SET content_hash = ?,
                signature = ?,
                signed_by = ?,
                signed_at = ?,
                trust_level = 'signed',
                public_key_fingerprint = ?
          WHERE id = ?`
      ).run(
        contentHash,
        record.signature,
        record.signed_by,
        record.signed_at,
        record.public_key_fingerprint,
        row.id
      );

      // Audit receipt for signing — IDs/hashes/classifications/reasons only (no raw secrets)
      try {
        const built = buildSkillAuditEntry(db, {
          tenantId: "default-tenant",
          actorId: record.signed_by,
          actorRole: "operator" as const,
          eventType: "skill.signed",
          entityType: "skill",
          entityId: `skill:${row.id}`,
          reason: `skill signed: ${row.name}@${row.source_harness}`,
          metadata: {
            skill_id: row.id,
            skill_name: row.name,
            source_harness: row.source_harness,
            content_hash: contentHash,
            public_key_fingerprint: record.public_key_fingerprint,
            classification: "skill_signing",
          },
        });
        db.prepare(
          `INSERT INTO audit_entries
            (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          built.id,
          built.tenantId,
          built.actorId,
          built.actorRole,
          built.eventType,
          built.entityType,
          built.entityId,
          built.reason,
          built.metadata_json,
          built.created_at
        );
      } catch {
        // fallback plain audit if chain builder unavailable
        db.prepare(
          `INSERT INTO audit_entries
            (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          randomUUID(),
          "default-tenant",
          record.signed_by,
          "operator",
          "skill.signed",
          "skill",
          `skill:${row.id}`,
          `skill signed: ${row.name}@${row.source_harness}`,
          JSON.stringify({
            skill_id: row.id,
            skill_name: row.name,
            source_harness: row.source_harness,
            content_hash: contentHash,
            public_key_fingerprint: record.public_key_fingerprint,
            classification: "skill_signing",
          }),
          new Date().toISOString()
        );
      }
    })();
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: `Database error: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    skill: {
      id: row.id,
      name: row.name,
      source_harness: row.source_harness,
      content_hash: contentHash,
      signature: record.signature,
      signed_by: record.signed_by,
      signed_at: record.signed_at,
      public_key_fingerprint: record.public_key_fingerprint,
      trust_level: "signed",
    },
  });
}

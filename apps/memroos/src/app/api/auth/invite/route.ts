import { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { getDb } from '@/lib/db';
import { authenticateUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/middleware-roles';
import { resolvePublicMemroosUrl } from '@/lib/public-base-url';
import type { UserRole } from '@/lib/auth/types';

interface InviteBody {
  role: UserRole;
  emailHint?: string;
}

const VALID_ROLES: UserRole[] = ['admin', 'operator', 'reviewer'];
const INVITE_TTL_HOURS = 72;

export async function POST(req: NextRequest) {
  const session = await authenticateUser(req);
  const roleError = requireRole(session?.role, 'admin');
  if (roleError) return roleError;
  if (!session) return Response.json({ error: 'authentication required' }, { status: 401 });

  let body: InviteBody;
  try {
    body = (await req.json()) as InviteBody;
  } catch {
    return Response.json({ error: 'invalid request body' }, { status: 400 });
  }

  const { role, emailHint } = body;
  if (!role || !VALID_ROLES.includes(role)) {
    return Response.json({ error: 'invalid role' }, { status: 400 });
  }

  const db = getDb();
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const inviteId = randomBytes(8).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString();

  db.prepare(
    `INSERT INTO team_invitations (id, token_hash, role, invited_by, email_hint, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(inviteId, tokenHash, role, session.userId, emailHint ?? null, expiresAt);

  const baseUrl = resolvePublicMemroosUrl(req);
  const inviteUrl = `${baseUrl}/invite/${rawToken}`;

  return Response.json({ inviteUrl }, { status: 201 });
}

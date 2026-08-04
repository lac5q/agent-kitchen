import { NextRequest } from 'next/server';

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from '@/lib/audit/event-types';
import { writeAuditEntry } from '@/lib/audit/write';
import { getDb } from '@/lib/db';
import { isHttpsRequest } from '@/lib/auth/secure-cookie';
import {
  readCookie,
  viewAsClaimsFromCookie,
} from '@/lib/auth/viewer';
import { authenticateUser } from '@/lib/auth/session';
import { signViewAsToken, verifyAccessToken } from '@/lib/auth/jwt';
import {
  VIEW_AS_TOKEN_COOKIE_NAME,
  VIEW_AS_TOKEN_MAX_AGE_SECONDS,
} from '@/lib/auth/session-limits';
import type { UserRole } from '@/lib/auth/types';

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  tenant_id: string;
  disabled_at: string | null;
}

interface RoleRow {
  role: UserRole;
}

function requestAccessToken(req: Request): string | null {
  const authorization = req.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim();
  return readCookie(req, 'access_token');
}

function userById(userId: string): UserRow | null {
  const user = getDb()
    .prepare(
      'SELECT id, email, display_name, tenant_id, disabled_at FROM users WHERE id = ?'
    )
    .get(userId) as UserRow | undefined;
  return user ?? null;
}

function roleByUserId(userId: string, fallback: UserRole): UserRole {
  const row = getDb()
    .prepare('SELECT role FROM user_roles WHERE user_id = ? LIMIT 1')
    .get(userId) as RoleRow | undefined;
  return row?.role ?? fallback;
}

function cookieValue(token: string, maxAge: number, req: Request): string {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  return `${VIEW_AS_TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax${secure}; Path=/; Max-Age=${maxAge}`;
}

function auditViewAs(input: {
  eventType: typeof AUDIT_EVENT_TYPES.VIEW_AS_START | typeof AUDIT_EVENT_TYPES.VIEW_AS_EXIT;
  actor: UserRow;
  actorRole: UserRole;
  target: { id: string; name: string };
}): void {
  writeAuditEntry({
    tenant_id: input.actor.tenant_id,
    actor_id: input.actor.id,
    actor_role: input.actorRole,
    event_type: input.eventType,
    entity_type: ENTITY_TYPES.USER,
    entity_id: input.target.id,
    reason:
      input.eventType === AUDIT_EVENT_TYPES.VIEW_AS_START
        ? `${input.actor.display_name || input.actor.email} started viewing as ${input.target.name}`
        : `${input.actor.display_name || input.actor.email} exited viewing as ${input.target.name}`,
    metadata_json: {
      actorId: input.actor.id,
      actorName: input.actor.display_name || input.actor.email,
      targetId: input.target.id,
      targetName: input.target.name,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 });
  }

  const accessToken = requestAccessToken(req);
  if (!accessToken || !(await verifyAccessToken(accessToken))) {
    return Response.json({ error: 'view-as requires a human session' }, { status: 403 });
  }

  const actor = userById(session.userId);
  const actorRole = actor ? roleByUserId(actor.id, session.role) : session.role;
  if (!actor || actor.disabled_at || actorRole !== 'admin') {
    return Response.json({ error: 'insufficient permissions' }, { status: 403 });
  }

  const existing = await viewAsClaimsFromCookie(req);
  if (existing) {
    return Response.json({ error: 'view-as session already active' }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid request body' }, { status: 400 });
  }
  const targetUserId =
    typeof body === 'object' && body !== null && 'targetUserId' in body
      ? (body as { targetUserId?: unknown }).targetUserId
      : undefined;
  if (typeof targetUserId !== 'string' || !targetUserId.trim()) {
    return Response.json({ error: 'targetUserId is required' }, { status: 400 });
  }

  const target = userById(targetUserId.trim());
  if (!target || target.disabled_at) {
    return Response.json({ error: 'target user not found' }, { status: 404 });
  }
  if (target.tenant_id !== actor.tenant_id) {
    return Response.json({ error: 'cross-tenant view-as is not allowed' }, { status: 403 });
  }

  const token = await signViewAsToken(actor.id, target.id);
  try {
    auditViewAs({
      eventType: AUDIT_EVENT_TYPES.VIEW_AS_START,
      actor,
      actorRole,
      target: { id: target.id, name: target.display_name || target.email },
    });
  } catch {
    return Response.json({ error: 'view-as audit unavailable' }, { status: 500 });
  }

  const response = Response.json({
    ok: true,
    viewingAs: {
      targetUserId: target.id,
      targetName: target.display_name || target.email,
      actorUserId: actor.id,
      expiresAt: new Date(Date.now() + VIEW_AS_TOKEN_MAX_AGE_SECONDS * 1000).toISOString(),
    },
  });
  response.headers.append(
    'Set-Cookie',
    cookieValue(token, VIEW_AS_TOKEN_MAX_AGE_SECONDS, req)
  );
  return response;
}

export async function DELETE(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 });
  }

  const claims = await viewAsClaimsFromCookie(req);
  if (claims && claims.actor === session.userId) {
    const actor = userById(session.userId);
    if (actor) {
      const target = userById(claims.target);
      const actorRole = roleByUserId(actor.id, session.role);
      try {
        auditViewAs({
          eventType: AUDIT_EVENT_TYPES.VIEW_AS_EXIT,
          actor,
          actorRole,
          target: {
            id: claims.target,
            name: target?.display_name || target?.email || claims.target,
          },
        });
      } catch {
        return Response.json({ error: 'view-as audit unavailable' }, { status: 500 });
      }
    }
  }

  const response = Response.json({ ok: true });
  response.headers.append('Set-Cookie', cookieValue('', 0, req));
  return response;
}

import { getDb } from '@/lib/db';
import { ROLE_RANK } from './middleware-roles';
import { authenticateUser } from './session';
import {
  verifyAccessToken,
  verifyViewAsToken,
  type ViewAsJwtPayload,
} from './jwt';
import { VIEW_AS_TOKEN_COOKIE_NAME } from './session-limits';
import type { ResolvedViewer, UserRole } from './types';

export function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** A forged token still activates the read-only boundary, but never access. */
export function isSyntacticallyValidViewAsToken(token: string | null): token is string {
  if (!token) return false;
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function requestCredential(req: Request): string | null {
  const authorization = req.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim();
  return readCookie(req, 'access_token');
}

function isJwtCredential(credential: string | null): boolean {
  return Boolean(credential && credential.split('.').length === 3);
}

interface UserRecord {
  id: string;
  email: string;
  display_name: string;
  tenant_id: string;
  disabled_at: string | null;
}

interface RoleRecord {
  role: UserRole;
}

function getUser(db: ReturnType<typeof getDb>, userId: string): UserRecord | null {
  const user = db
    .prepare(
      'SELECT id, email, display_name, tenant_id, disabled_at FROM users WHERE id = ?'
    )
    .get(userId) as UserRecord | undefined;
  return user ?? null;
}

function getRole(db: ReturnType<typeof getDb>, userId: string, fallback: UserRole): UserRole {
  const row = db
    .prepare('SELECT role FROM user_roles WHERE user_id = ? LIMIT 1')
    .get(userId) as RoleRecord | undefined;
  return row?.role ?? fallback;
}

function cappedRole(actorRole: UserRole, targetRole: UserRole): UserRole {
  return ROLE_RANK[targetRole] <= ROLE_RANK[actorRole] ? targetRole : actorRole;
}

function viewingAsMetadata(
  claims: ViewAsJwtPayload,
  target: UserRecord
): NonNullable<ResolvedViewer['viewingAs']> {
  return {
    targetUserId: target.id,
    targetName: target.display_name || target.email,
    actorUserId: claims.actor,
    expiresAt: new Date((claims.exp as number) * 1000).toISOString(),
  };
}

/**
 * Resolves the real session first, then optionally applies a valid view-as
 * context. API-key credentials deliberately return the real session and never
 * consult the view-as cookie.
 */
export async function resolveViewer(req: Request): Promise<ResolvedViewer | null> {
  const session = await authenticateUser(req);
  if (!session) return null;

  const credential = requestCredential(req);
  if (!isJwtCredential(credential)) return session;

  // Keep the credential classification tied to the real access token. A
  // malformed/expired access token must not become a view-as route around auth.
  if (!credential || !(await verifyAccessToken(credential))) return session;

  const rawViewAsToken = readCookie(req, VIEW_AS_TOKEN_COOKIE_NAME);
  if (!isSyntacticallyValidViewAsToken(rawViewAsToken)) return session;
  const claims = await verifyViewAsToken(rawViewAsToken);
  if (!claims || claims.actor !== session.userId) return session;

  const db = getDb();
  const actor = getUser(db, session.userId);
  const target = getUser(db, claims.target);
  if (!actor || actor.disabled_at || !target || target.disabled_at) return session;
  if (actor.tenant_id !== target.tenant_id) return session;

  const actorRole = getRole(db, actor.id, session.role);
  if (actorRole !== 'admin') return session;
  const targetRole = getRole(db, target.id, 'reviewer');

  return {
    userId: target.id,
    role: cappedRole(actorRole, targetRole),
    email: target.email,
    displayName: target.display_name,
    tenantId: target.tenant_id,
    viewingAs: viewingAsMetadata(claims, target),
  };
}

export function viewAsClaimsFromCookie(req: Request): Promise<ViewAsJwtPayload | null> {
  const raw = readCookie(req, VIEW_AS_TOKEN_COOKIE_NAME);
  return raw && isSyntacticallyValidViewAsToken(raw)
    ? verifyViewAsToken(raw)
    : Promise.resolve(null);
}

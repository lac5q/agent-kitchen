import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/middleware-roles';
import type { UserRole } from '@/lib/auth/types';

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  tenant_id: string;
  created_at: string;
  last_login_at: string | null;
  disabled_at: string | null;
};

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 });
  }
  const roleError = requireRole(session.role, 'admin');
  if (roleError) return roleError;

  const db = getDb();
  const users = db
    .prepare(
      'SELECT id, email, display_name, tenant_id, created_at, last_login_at, disabled_at FROM users ORDER BY created_at ASC'
    )
    .all() as UserRow[];

  const result = users.map((u) => {
    const roleRow = db
      .prepare('SELECT role FROM user_roles WHERE user_id = ? LIMIT 1')
      .get(u.id) as { role: UserRole } | undefined;
    return {
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      tenantId: u.tenant_id,
      role: roleRow?.role ?? 'reviewer',
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at,
      // Surfaced so the Team page can show who is disabled and offer re-enable.
      disabledAt: u.disabled_at,
    };
  });

  return Response.json({ users: result });
}

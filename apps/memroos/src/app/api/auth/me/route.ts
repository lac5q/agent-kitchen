import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateUser } from '@/lib/auth/session';
import { resolveViewer } from '@/lib/auth/viewer';
import type { UserRole } from '@/lib/auth/types';

type UserRow = { id: string; email: string; display_name: string; tenant_id: string };
type RoleRow = { role: UserRole };

export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 });
  }
  const resolvedViewer = await resolveViewer(req);

  const db = getDb();
  const user = db
    .prepare('SELECT id, email, display_name, tenant_id FROM users WHERE id = ?')
    .get(session.userId) as UserRow | undefined;

  if (!user) {
    return Response.json({ error: 'user not found' }, { status: 404 });
  }

  const roleRow = db
    .prepare('SELECT role FROM user_roles WHERE user_id = ? LIMIT 1')
    .get(user.id) as RoleRow | undefined;

  return Response.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    tenantId: user.tenant_id,
    role: roleRow?.role ?? 'reviewer',
    ...(resolvedViewer?.viewingAs ? { viewingAs: resolvedViewer.viewingAs } : {}),
  });
}

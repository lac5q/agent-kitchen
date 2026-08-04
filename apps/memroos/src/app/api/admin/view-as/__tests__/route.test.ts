// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: null as {
    userId: string;
    role: 'admin' | 'operator' | 'reviewer';
    email: string;
    displayName: string;
    tenantId: string;
  } | null,
  users: new Map<string, {
    id: string;
    email: string;
    display_name: string;
    tenant_id: string;
    disabled_at: string | null;
  }>(),
  roles: new Map<string, 'admin' | 'operator' | 'reviewer'>(),
  auditRows: [] as unknown[][],
}));

vi.mock('@/lib/auth/session', () => ({
  authenticateUser: async () => state.session,
}));

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      get: (id: string) => {
        if (sql.includes('FROM users')) return state.users.get(id);
        if (sql.includes('FROM user_roles')) {
          const role = state.roles.get(id);
          return role ? { role } : undefined;
        }
        return undefined;
      },
      run: (...args: unknown[]) => {
        if (sql.includes('INSERT INTO audit_entries')) state.auditRows.push(args);
      },
    }),
  }),
}));

const { POST, DELETE } = await import('../route');
const { signAccessToken, signViewAsToken } = await import('@/lib/auth/jwt');

const ACTOR = {
  userId: 'admin-1',
  role: 'admin' as const,
  email: 'admin@example.com',
  displayName: 'Admin One',
  tenantId: 'tenant-a',
};

beforeEach(() => {
  process.env.MEMROOS_JWT_SECRET = 'test-secret-that-is-long-enough-32ch';
  state.session = ACTOR;
  state.users = new Map([
    ['admin-1', { id: 'admin-1', email: 'admin@example.com', display_name: 'Admin One', tenant_id: 'tenant-a', disabled_at: null }],
    ['reviewer-1', { id: 'reviewer-1', email: 'reviewer@example.com', display_name: 'Reviewer One', tenant_id: 'tenant-a', disabled_at: null }],
  ]);
  state.roles = new Map([
    ['admin-1', 'admin'],
    ['reviewer-1', 'reviewer'],
  ]);
  state.auditRows = [];
});

describe('/api/admin/view-as', () => {
  it('audits both humans on start and exit and clears the cookie', async () => {
    const accessToken = await signAccessToken(ACTOR.userId, ACTOR.role);
    const start = await POST(
      new Request('http://localhost/api/admin/view-as', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ targetUserId: 'reviewer-1' }),
      })
    );

    expect(start.status).toBe(200);
    const setCookie = start.headers.get('set-cookie') ?? '';
    const token = setCookie.match(/view_as_token=([^;]+)/)?.[1];
    expect(token).toBeTruthy();
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=900');

    const exit = await DELETE(
      new Request('http://localhost/api/admin/view-as', {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${accessToken}`,
          cookie: `view_as_token=${token}`,
        },
      })
    );

    expect(exit.status).toBe(200);
    expect(exit.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(state.auditRows).toHaveLength(2);
    const startAudit = state.auditRows[0];
    const exitAudit = state.auditRows[1];
    expect(startAudit[4]).toBe('view_as.start');
    expect(exitAudit[4]).toBe('view_as.exit');
    expect(JSON.parse(String(startAudit[8]))).toMatchObject({
      actorId: 'admin-1',
      actorName: 'Admin One',
      targetId: 'reviewer-1',
      targetName: 'Reviewer One',
    });
    expect(JSON.parse(String(exitAudit[8]))).toMatchObject({
      actorId: 'admin-1',
      targetId: 'reviewer-1',
    });
  });

  it('rejects a non-admin start', async () => {
    state.session = { ...ACTOR, role: 'reviewer' };
    state.roles.set('admin-1', 'reviewer');
    const accessToken = await signAccessToken(ACTOR.userId, 'reviewer');

    const response = await POST(
      new Request('http://localhost/api/admin/view-as', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ targetUserId: 'reviewer-1' }),
      })
    );

    expect(response.status).toBe(403);
    expect(state.auditRows).toHaveLength(0);
  });

  it('rejects starting a second view-as session while one is active', async () => {
    const accessToken = await signAccessToken(ACTOR.userId, ACTOR.role);
    const viewAsToken = await signViewAsToken(ACTOR.userId, 'reviewer-1');

    const response = await POST(
      new Request('http://localhost/api/admin/view-as', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          cookie: `view_as_token=${viewAsToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ targetUserId: 'reviewer-1' }),
      })
    );

    expect(response.status).toBe(409);
    expect(state.auditRows).toHaveLength(0);
  });
});

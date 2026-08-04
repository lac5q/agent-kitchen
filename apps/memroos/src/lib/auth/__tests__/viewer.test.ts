// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

const state = vi.hoisted(() => ({
  session: null as {
    userId: string;
    role: 'admin' | 'operator' | 'reviewer';
    email: string;
    displayName: string;
    tenantId: string;
  } | null,
  users: [] as {
    id: string;
    email: string;
    display_name: string;
    tenant_id: string;
    disabled_at: string | null;
  }[],
  roles: {} as Record<string, 'admin' | 'operator' | 'reviewer'>,
}));

vi.mock('../session', () => ({
  authenticateUser: async () => state.session,
}));

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      get: (userId: string) => {
        if (sql.includes('FROM users')) return state.users.find((user) => user.id === userId);
        return state.roles[userId] ? { role: state.roles[userId] } : undefined;
      },
    }),
  }),
}));

const { resolveViewer } = await import('../viewer');
const { signAccessToken, signViewAsToken } = await import('../jwt');

const ACTOR = {
  userId: 'admin-1',
  role: 'admin' as const,
  email: 'admin@example.com',
  displayName: 'Admin One',
  tenantId: 'tenant-a',
};

function request(accessToken: string, viewAsToken: string) {
  return new Request('http://localhost/api/agents', {
    headers: {
      authorization: `Bearer ${accessToken}`,
      cookie: `view_as_token=${viewAsToken}`,
    },
  });
}

beforeEach(() => {
  process.env.MEMROOS_JWT_SECRET = 'test-secret-that-is-long-enough-32ch';
  state.session = ACTOR;
  state.users = [
    {
      id: 'admin-1',
      email: 'admin@example.com',
      display_name: 'Admin One',
      tenant_id: 'tenant-a',
      disabled_at: null,
    },
    {
      id: 'reviewer-1',
      email: 'reviewer@example.com',
      display_name: 'Reviewer One',
      tenant_id: 'tenant-a',
      disabled_at: null,
    },
    {
      id: 'admin-2',
      email: 'other-admin@example.com',
      display_name: 'Admin Two',
      tenant_id: 'tenant-a',
      disabled_at: null,
    },
  ];
  state.roles = {
    'admin-1': 'admin',
    'reviewer-1': 'reviewer',
    'admin-2': 'admin',
  };
});

describe('resolveViewer', () => {
  it('resolves a valid view-as token to the target scope and metadata', async () => {
    const accessToken = await signAccessToken(ACTOR.userId, ACTOR.role);
    const viewAsToken = await signViewAsToken(ACTOR.userId, 'reviewer-1');

    const viewer = await resolveViewer(request(accessToken, viewAsToken));

    expect(viewer).toMatchObject({
      userId: 'reviewer-1',
      role: 'reviewer',
      tenantId: 'tenant-a',
      viewingAs: {
        actorUserId: 'admin-1',
        targetUserId: 'reviewer-1',
        targetName: 'Reviewer One',
      },
    });
  });

  it('ignores an expired view-as token and returns the real admin', async () => {
    const accessToken = await signAccessToken(ACTOR.userId, ACTOR.role);
    const viewAsToken = await new SignJWT({ actor: ACTOR.userId, target: 'reviewer-1', typ: 'view-as' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(new TextEncoder().encode(process.env.MEMROOS_JWT_SECRET));

    await expect(resolveViewer(request(accessToken, viewAsToken))).resolves.toMatchObject(ACTOR);
  });

  it('ignores the view-as cookie for API-key authentication', async () => {
    state.session = { ...ACTOR, role: 'operator' };
    const viewAsToken = await signViewAsToken(ACTOR.userId, 'reviewer-1');

    await expect(resolveViewer(request('ak_user_key', viewAsToken))).resolves.toMatchObject({
      userId: 'admin-1',
      role: 'operator',
    });
  });

  it('never resolves a view-as target when the real session is invalid', async () => {
    state.session = null;
    const accessToken = await signAccessToken(ACTOR.userId, ACTOR.role);
    const viewAsToken = await signViewAsToken(ACTOR.userId, 'reviewer-1');

    await expect(resolveViewer(request(accessToken, viewAsToken))).resolves.toBeNull();
  });

  it('caps an admin-equivalent target at the actor role', async () => {
    const accessToken = await signAccessToken(ACTOR.userId, ACTOR.role);
    const viewAsToken = await signViewAsToken(ACTOR.userId, 'admin-2');

    await expect(resolveViewer(request(accessToken, viewAsToken))).resolves.toMatchObject({
      userId: 'admin-2',
      role: 'admin',
    });
  });
});

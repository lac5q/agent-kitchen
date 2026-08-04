// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES,
  CAPABILITY,
  ROLE_CAPABILITIES,
  hasCapability,
  requireCapability,
  type Capability,
  type Principal,
} from '../capabilities';
import { ROLE_RANK, requireRole } from '../middleware-roles';
import type { UserRole } from '../types';

const ROLES: UserRole[] = ['reviewer', 'operator', 'admin'];
const USER_ROLES: Array<UserRole | null | undefined> = [
  null,
  undefined,
  ...ROLES,
];

describe('capability catalog', () => {
  it('is a typed, unique, exhaustive runtime catalog', () => {
    expect(CAPABILITIES).toEqual(Object.values(CAPABILITY));
    expect(CAPABILITIES).toHaveLength(new Set(CAPABILITIES).size);
    expect(CAPABILITIES).toContain(CAPABILITY.AGENTS_REGISTER);
    expect(CAPABILITIES).toContain(CAPABILITY.KEYS_ISSUE);
    expect(CAPABILITIES).toContain(CAPABILITY.POLICY_WRITE);
    expect(CAPABILITIES).toContain(CAPABILITY.USERS_MANAGE);
    expect(CAPABILITIES).toContain(CAPABILITY.AGENTS_READ);
  });

  it('preserves the current linear containment relationship', () => {
    for (const capability of ROLE_CAPABILITIES.reviewer) {
      expect(ROLE_CAPABILITIES.operator.has(capability)).toBe(true);
      expect(ROLE_CAPABILITIES.admin.has(capability)).toBe(true);
    }
    for (const capability of ROLE_CAPABILITIES.operator) {
      expect(ROLE_CAPABILITIES.admin.has(capability)).toBe(true);
    }
  });
});

describe('hasCapability', () => {
  const human = (role: UserRole): Principal => ({ userId: `user-${role}`, role });

  it('evaluates human sessions from their role capability set', () => {
    expect(hasCapability(human('reviewer'), CAPABILITY.MEMORY_READ)).toBe(true);
    expect(hasCapability({ kind: 'human', ...human('reviewer') }, CAPABILITY.MEMORY_READ)).toBe(true);
    expect(hasCapability({ type: 'human', ...human('reviewer') }, CAPABILITY.MEMORY_READ)).toBe(true);
    expect(hasCapability(human('reviewer'), CAPABILITY.POLICY_WRITE)).toBe(false);
    expect(hasCapability(human('operator'), CAPABILITY.POLICY_WRITE)).toBe(true);
    expect(hasCapability(human('operator'), CAPABILITY.USERS_MANAGE)).toBe(false);
    expect(hasCapability(human('admin'), CAPABILITY.USERS_MANAGE)).toBe(true);
  });

  it('fails closed for absent principals and leaves the agent seam unimplemented', () => {
    const agent: Principal = { kind: 'agent', agentId: 'agent-1' };
    const typedAgent: Principal = { type: 'agent', agentId: 'agent-2' };
    expect(hasCapability(null, CAPABILITY.AGENTS_READ)).toBe(false);
    expect(hasCapability(undefined, CAPABILITY.AGENTS_READ)).toBe(false);
    expect(hasCapability(agent, CAPABILITY.AGENTS_READ)).toBe(false);
    expect(hasCapability(typedAgent, CAPABILITY.AGENTS_READ)).toBe(false);
  });
});

describe('requireCapability', () => {
  it('returns null for a held capability and the standard 403 otherwise', async () => {
    const principal = { userId: 'user-operator', role: 'operator' as const };
    expect(requireCapability(principal, CAPABILITY.POLICY_WRITE)).toBeNull();

    const response = requireCapability(principal, CAPABILITY.USERS_MANAGE);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);
    await expect(response!.json()).resolves.toEqual({ error: 'insufficient permissions' });
  });
});

describe('requireRole equivalence', () => {
  it('agrees with the old rank comparison for every userRole x minRole pair', () => {
    let pairs = 0;

    for (const userRole of USER_ROLES) {
      for (const minRole of ROLES) {
        const oldAllows =
          userRole !== null
          && userRole !== undefined
          && ROLE_RANK[userRole] >= ROLE_RANK[minRole];
        const derivedAllows = requireRole(userRole, minRole) === null;

        expect(derivedAllows, `${String(userRole)} x ${minRole}`).toBe(oldAllows);
        pairs += 1;
      }
    }

    expect(pairs).toBe(15);
  });

  it('also preserves null and undefined minimum behavior for untyped callers', () => {
    const invalidMinimums = [null, undefined] as Array<UserRole | null | undefined>;

    for (const userRole of USER_ROLES) {
      for (const minRole of invalidMinimums) {
        const oldAllows = Boolean(userRole);
        const derivedAllows = requireRole(userRole, minRole as UserRole) === null;
        expect(derivedAllows, `${String(userRole)} x ${String(minRole)}`).toBe(oldAllows);
      }
    }
  });
});

const _capabilityTypeCheck = (capability: Capability): Capability => capability;
_capabilityTypeCheck(CAPABILITY.AGENTS_READ);

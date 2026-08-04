import type { UserRole } from './types';
import {
  ROLE_CAPABILITIES,
  hasCapability,
  insufficientPermissions,
  type Capability,
  type HumanPrincipal,
} from './capabilities';

const ROLE_RANK: Record<UserRole, number> = {
  reviewer: 1,
  operator: 2,
  admin: 3,
};

/**
 * Returns a 403 Response if the user's role is below the required minimum.
 * Returns null if the role check passes.
 */
export function requireRole(
  userRole: UserRole | null | undefined,
  minRole: UserRole
): Response | null {
  const principal: HumanPrincipal | null = userRole
    ? { userId: 'legacy-role-facade', role: userRole }
    : null;
  const requiredCapabilities = ROLE_CAPABILITIES[minRole as UserRole];

  // `minRole` is statically a UserRole. The undefined-set branch preserves
  // the old JavaScript comparison behavior for untyped callers that pass an
  // undefined minimum; every valid minimum is always capability-derived.
  if (
    !principal
    || (requiredCapabilities !== undefined
      && ![...requiredCapabilities].every((capability: Capability) =>
        hasCapability(principal, capability)
      ))
  ) {
    return insufficientPermissions();
  }
  return null;
}

export { ROLE_RANK };

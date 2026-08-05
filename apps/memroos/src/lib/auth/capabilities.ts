import type { UserRole } from './types';

/**
 * The capability vocabulary is the authorization source of truth. Keep the
 * values here rather than repeating verb strings at call sites so additions
 * are visible in one exhaustive catalog.
 */
export const CAPABILITY = {
  AGENTS_READ: 'agents:read',
  AGENTS_REGISTER: 'agents:register',
  AGENTS_MANAGE: 'agents:manage',
  AGENT_REPORTS_MANAGE: 'agent-reports:manage',
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',
  AUTH_CAPABILITIES: 'auth:capabilities',
  BELIEFS_REVIEW: 'beliefs:review',
  CLASSIFICATION_REVIEW: 'classification:review',
  COMPLIANCE_MANAGE: 'compliance:manage',
  DIRECTIVES_MANAGE: 'directives:manage',
  DISPATCH_RUN: 'dispatch:run',
  DSAR_MANAGE: 'dsar:manage',
  ESCALATIONS_READ: 'escalations:read',
  ESCALATIONS_RESOLVE: 'escalations:resolve',
  EVALS_RUN: 'evals:run',
  INVITES_MANAGE: 'invites:manage',
  KEYS_ISSUE: 'keys:issue',
  L3_POLL: 'l3:poll',
  LIBRARY_UPDATE: 'library:update',
  MEMORY_CONSOLIDATE: 'memory:consolidate',
  MEMORY_EXPORT: 'memory:export',
  MEMORY_READ: 'memory:read',
  MEMORY_WRITE: 'memory:write',
  MEETINGS_JOIN: 'meetings:join',
  POLICY_WRITE: 'policy:write',
  SEAL_WRITE: 'seal:write',
  SKILLS_REVIEW: 'skills:review',
  USERS_MANAGE: 'users:manage',
  VAULT_MANAGE: 'vault:manage',
  VIEW_AS_MANAGE: 'view-as:manage',
} as const;

export type Capability = (typeof CAPABILITY)[keyof typeof CAPABILITY];

/** Every catalog entry, in stable order for callers that need to enumerate. */
export const CAPABILITIES = [
  CAPABILITY.AGENTS_READ,
  CAPABILITY.AGENTS_REGISTER,
  CAPABILITY.AGENTS_MANAGE,
  CAPABILITY.AGENT_REPORTS_MANAGE,
  CAPABILITY.AUDIT_READ,
  CAPABILITY.AUDIT_EXPORT,
  CAPABILITY.AUTH_CAPABILITIES,
  CAPABILITY.BELIEFS_REVIEW,
  CAPABILITY.CLASSIFICATION_REVIEW,
  CAPABILITY.COMPLIANCE_MANAGE,
  CAPABILITY.DIRECTIVES_MANAGE,
  CAPABILITY.DISPATCH_RUN,
  CAPABILITY.DSAR_MANAGE,
  CAPABILITY.ESCALATIONS_READ,
  CAPABILITY.ESCALATIONS_RESOLVE,
  CAPABILITY.EVALS_RUN,
  CAPABILITY.INVITES_MANAGE,
  CAPABILITY.KEYS_ISSUE,
  CAPABILITY.L3_POLL,
  CAPABILITY.LIBRARY_UPDATE,
  CAPABILITY.MEMORY_CONSOLIDATE,
  CAPABILITY.MEMORY_EXPORT,
  CAPABILITY.MEMORY_READ,
  CAPABILITY.MEMORY_WRITE,
  CAPABILITY.MEETINGS_JOIN,
  CAPABILITY.POLICY_WRITE,
  CAPABILITY.SEAL_WRITE,
  CAPABILITY.SKILLS_REVIEW,
  CAPABILITY.USERS_MANAGE,
  CAPABILITY.VAULT_MANAGE,
  CAPABILITY.VIEW_AS_MANAGE,
] as const satisfies readonly Capability[];

/**
 * Human sessions already carry the two fields needed for capability lookup.
 * Agent principals are deliberately a separate, unimplemented seam: later
 * phases can resolve their effective grants without changing this API.
 */
export interface HumanPrincipal {
  readonly userId: string;
  readonly role: UserRole;
  readonly kind?: 'human';
  readonly type?: 'human';
}

export interface AgentPrincipal {
  readonly agentId: string;
  readonly kind?: 'agent';
  readonly type?: 'agent';
  readonly ownerUserId?: string;
}

export type Principal = HumanPrincipal | AgentPrincipal;

const REVIEWER_CAPABILITIES: readonly Capability[] = [
  CAPABILITY.AGENTS_READ,
  CAPABILITY.AUDIT_READ,
  CAPABILITY.CLASSIFICATION_REVIEW,
  CAPABILITY.ESCALATIONS_READ,
  CAPABILITY.MEMORY_READ,
];

const OPERATOR_CAPABILITIES: readonly Capability[] = [
  CAPABILITY.AGENTS_REGISTER,
  // Phase 229's agent issue reports were gated at the operator rank. Placing the
  // capability here keeps that exact reach — AGENTS_MANAGE is admin-only and
  // would have silently locked operators out.
  CAPABILITY.AGENT_REPORTS_MANAGE,
  CAPABILITY.AUDIT_EXPORT,
  CAPABILITY.BELIEFS_REVIEW,
  CAPABILITY.DISPATCH_RUN,
  CAPABILITY.ESCALATIONS_RESOLVE,
  CAPABILITY.EVALS_RUN,
  CAPABILITY.KEYS_ISSUE,
  CAPABILITY.L3_POLL,
  CAPABILITY.LIBRARY_UPDATE,
  CAPABILITY.MEMORY_CONSOLIDATE,
  CAPABILITY.MEMORY_EXPORT,
  CAPABILITY.MEMORY_WRITE,
  CAPABILITY.MEETINGS_JOIN,
  CAPABILITY.POLICY_WRITE,
  CAPABILITY.SEAL_WRITE,
  CAPABILITY.SKILLS_REVIEW,
];

const ADMIN_CAPABILITIES: readonly Capability[] = [
  CAPABILITY.AGENTS_MANAGE,
  CAPABILITY.AUTH_CAPABILITIES,
  CAPABILITY.COMPLIANCE_MANAGE,
  CAPABILITY.DIRECTIVES_MANAGE,
  CAPABILITY.DSAR_MANAGE,
  CAPABILITY.INVITES_MANAGE,
  CAPABILITY.USERS_MANAGE,
  CAPABILITY.VAULT_MANAGE,
  CAPABILITY.VIEW_AS_MANAGE,
];

function capabilitySet(...capabilities: readonly Capability[]): ReadonlySet<Capability> {
  return new Set(capabilities);
}

const reviewerCapabilities = capabilitySet(...REVIEWER_CAPABILITIES);
const operatorCapabilities = capabilitySet(
  ...REVIEWER_CAPABILITIES,
  ...OPERATOR_CAPABILITIES,
);
const adminCapabilities = capabilitySet(
  ...REVIEWER_CAPABILITIES,
  ...OPERATOR_CAPABILITIES,
  ...ADMIN_CAPABILITIES,
);

/**
 * The current linear role behavior expressed as capability sets. The
 * containment relationship is intentional and is tested as a contract.
 */
export const ROLE_CAPABILITIES: Record<UserRole, ReadonlySet<Capability>> = {
  reviewer: reviewerCapabilities,
  operator: operatorCapabilities,
  admin: adminCapabilities,
};

function isHumanPrincipal(principal: Principal): principal is HumanPrincipal {
  const taggedPrincipal = principal as { kind?: string; type?: string };
  return (
    'userId' in principal
    && 'role' in principal
    && taggedPrincipal.kind !== 'agent'
    && taggedPrincipal.type !== 'agent'
  );
}

/** The single capability evaluator for all principal kinds. */
export function hasCapability(
  principal: Principal | null | undefined,
  capability: Capability,
): boolean {
  if (!principal || !isHumanPrincipal(principal)) return false;
  return ROLE_CAPABILITIES[principal.role]?.has(capability) ?? false;
}

function insufficientPermissions(): Response {
  return Response.json(
    { error: 'insufficient permissions' },
    { status: 403 },
  );
}

/** Forward authorization API for capability-oriented call sites. */
export function requireCapability(
  principal: Principal | null | undefined,
  capability: Capability,
): Response | null {
  return hasCapability(principal, capability) ? null : insufficientPermissions();
}

export { insufficientPermissions };

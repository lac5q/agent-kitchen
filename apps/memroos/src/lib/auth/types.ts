/**
 * Phase 63: Auth types used across the auth library and API routes.
 */

export type UserRole = 'admin' | 'operator' | 'reviewer';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface SessionUser {
  userId: string;
  role: UserRole;
  email: string;
  displayName: string;
  tenantId: string;
}

export interface ViewingAsMetadata {
  targetUserId: string;
  targetName: string;
  actorUserId: string;
  expiresAt: string;
}

export type ResolvedViewer = SessionUser & {
  viewingAs?: ViewingAsMetadata;
};

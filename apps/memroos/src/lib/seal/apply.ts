/**
 * Phase 62 dogfood refactor:
 * In production, SealService receives an SDK-backed EvalServiceLike that routes
 * eval calls through the public HTTP API surface. In development/test, it falls
 * back to direct EvalService (no server required).
 */
import { SealService } from "./service";
import type { ApplyResult } from "./types";

export async function applyProposalWithService(service: SealService, proposalId: string): Promise<ApplyResult> {
  return service.applyProposal(proposalId);
}

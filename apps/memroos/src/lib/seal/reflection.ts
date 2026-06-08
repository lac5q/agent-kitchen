import { SealService } from "./service";
import type { SealProposal } from "./types";

export async function reflectOnTraceWithService(
  service: SealService,
  traceId: string,
  runId: string
): Promise<SealProposal[]> {
  return service.reflectOnTrace(traceId, runId);
}

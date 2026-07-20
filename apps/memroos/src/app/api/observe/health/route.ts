import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { listObserveHarnessHealth } from "@/lib/observe-health";
import { OBSERVE_HARNESS_PATHS } from "@/lib/observe-sidecar";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const db = getDb();
    const harnesses = listObserveHarnessHealth(db);
    return Response.json({
      ok: true,
      depthDefault: process.env.MEMROOS_CAPTURE_DEPTH ?? "relevant",
      catalog: OBSERVE_HARNESS_PATHS,
      harnesses,
    });
  } catch (err) {
    return apiError(500, err instanceof Error ? err.message : String(err));
  }
}

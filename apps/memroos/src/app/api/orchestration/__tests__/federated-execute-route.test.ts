// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const persist = vi.fn();
const resolve = vi.fn();
const execute = vi.fn();

vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }));
vi.mock("@/lib/federation/action-bridge", () => ({
  persistFederationActionArtifact: persist,
  resolveFederationActionProof: resolve,
}));
vi.mock("@/lib/orchestration/client", () => ({ executeOrchestrationPlan: execute }));

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://memroos.example/api/orchestration/federated/execute", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const plan = {
  scope: { tenantId: "tenant-a", spaceId: "space-a" },
  steps: [],
};
const artifact = {
  id: "artifact-1",
  artifactHash: "sha256:artifact",
  federationRunId: "fed-run-1",
  packHash: "sha256:pack",
  policyHash: "sha256:policy",
  ontologyHash: "sha256:ontology",
};

describe("POST /api/orchestration/federated/execute", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it("denies before proxy invocation when the persisted bridge is unavailable", async () => {
    vi.stubEnv("MEMROOS_OPERATOR_API_KEY", "operator-secret");
    persist.mockReturnValue({ status: "unavailable", reason: "federation_merge_unavailable" });
    const { POST } = await import("../federated/execute/route");
    const response = await POST(request({
      plan,
      federation: { tenantId: "tenant-a", spaceId: "space-a", federationRunId: "fed-run-1", packHash: "sha256:missing", ontologyRecords: [] },
    }, { authorization: "Bearer operator-secret" }));

    expect(response.status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
  });

  it("forwards only a server-signed safe proof reference to Python", async () => {
    vi.stubEnv("MEMROOS_OPERATOR_API_KEY", "operator-secret");
    vi.stubEnv("ORCHESTRATION_FEDERATION_PROOF_SECRET", "bridge-secret");
    persist.mockReturnValue({ status: "ready", artifact });
    resolve.mockReturnValue({ status: "ready", artifact });
    execute.mockResolvedValue({ ok: true, success: true, status: "completed", runId: "run-1" });
    const { POST } = await import("../federated/execute/route");
    const response = await POST(request({
      plan,
      federation: {
        tenantId: "tenant-a",
        spaceId: "space-a",
        federationRunId: "fed-run-1",
        packHash: "sha256:pack",
        ontologyRecords: [{ recordType: "message", recordId: "42" }],
        forgedProofHash: "sha256:attacker",
      },
    }, { authorization: "Bearer operator-secret" }));

    expect(response.status).toBe(200);
    const outbound = execute.mock.calls[0][0];
    expect(outbound.federationProof).toMatchObject({
      artifactId: "artifact-1",
      artifactHash: "sha256:artifact",
      federationRunId: "fed-run-1",
      packHash: "sha256:pack",
      signature: expect.any(String),
    });
    expect(outbound.federationProof.forgedProofHash).toBeUndefined();
  });
});

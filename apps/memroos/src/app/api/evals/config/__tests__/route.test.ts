// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/evals/config", () => ({
  loadEvalConfig: vi.fn(),
  saveEvalConfig: vi.fn(),
  formatEvalConfigYaml: vi.fn(),
  setActivePreset: vi.fn(),
}));

vi.mock("@/lib/operator-auth", () => ({
  authorizeRegistryWrite: vi.fn(),
  registryWriteUnauthorizedResponse: vi.fn(() =>
    Response.json({ ok: false, error: "unauthorized" }, { status: 403 })
  ),
}));

import { loadEvalConfig, saveEvalConfig, formatEvalConfigYaml, setActivePreset } from "@/lib/evals/config";
import { authorizeRegistryWrite } from "@/lib/operator-auth";
import { BUILT_IN_PRESETS } from "@/lib/evals/presets";
import type { EvalConfig } from "@/lib/evals/types";

const mockLoadEvalConfig = vi.mocked(loadEvalConfig);
const mockSaveEvalConfig = vi.mocked(saveEvalConfig);
const mockFormatEvalConfigYaml = vi.mocked(formatEvalConfigYaml);
const mockSetActivePreset = vi.mocked(setActivePreset);
const mockAuthorizeRegistryWrite = vi.mocked(authorizeRegistryWrite);

function stubConfig(overrides?: Partial<EvalConfig>): EvalConfig {
  return {
    judgeModel: { provider: "test", model: "test-model", modelFamily: "test", promptTemplateVersion: "v1" },
    goldenSets: { default: "default.jsonl", perRole: {} },
    scorers: { l1Capability: [], l2Quality: [], l3Outcome: [] },
    weights: { l1: 0.2, l2: 0.5, l3: 0.3 },
    weightPresets: { ...BUILT_IN_PRESETS },
    activePreset: null,
    driftGuard: { goldenAgreementFloor: 0.85, judgeRotationRequiresRebaseline: true },
    seal: { reflectionThreshold: 0.6, autoApply: false, proposalTypes: [] },
    agents: {},
    companies: {},
    businessOps: { poll_interval_seconds: 300, correlation_id_field: "corr" },
    finance: { enabled: false, transactionLabel: "t", reconciliationLabel: "r", exceptionLabel: "e", goldenSet: "g" },
    compliance: { dataResidency: { enabled: false, allowedLocalHosts: [] }, auditRetentionDays: 365, enabledAdapters: [] },
    cove: { enabled: false, maxVerificationQuestions: 4, parallelVerification: true },
    ...overrides,
  };
}

async function loadRoute() {
  vi.resetModules();
  return await import("../route");
}

describe("GET /api/evals/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadEvalConfig.mockReturnValue(stubConfig());
    mockFormatEvalConfigYaml.mockReturnValue("yaml: content");
  });

  it("returns config and yaml", async () => {
    const { GET } = await loadRoute();
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.config).toBeTruthy();
    expect(body.yaml).toBe("yaml: content");
    expect(body.timestamp).toBeTruthy();
  });
});

describe("PUT /api/evals/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormatEvalConfigYaml.mockReturnValue("yaml: updated");
  });

  it("returns 403 when not authorized", async () => {
    mockAuthorizeRegistryWrite.mockReturnValue(false);

    const { PUT } = await loadRoute();
    const req = new Request("http://localhost/api/evals/config", {
      method: "PUT",
      body: JSON.stringify({ config: stubConfig() }),
    });
    const response = await PUT(req as any);

    expect(response.status).toBe(403);
  });

  it("returns 400 when body has no config", async () => {
    mockAuthorizeRegistryWrite.mockReturnValue(true);

    const { PUT } = await loadRoute();
    const req = new Request("http://localhost/api/evals/config", {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const response = await PUT(req as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("config is required");
  });

  it("returns 400 when body is null (invalid JSON)", async () => {
    mockAuthorizeRegistryWrite.mockReturnValue(true);

    const { PUT } = await loadRoute();
    const req = new Request("http://localhost/api/evals/config", {
      method: "PUT",
      body: "not json",
    });
    const response = await PUT(req as any);

    expect(response.status).toBe(400);
  });

  it("saves config and returns updated yaml on success", async () => {
    mockAuthorizeRegistryWrite.mockReturnValue(true);
    const cfg = stubConfig();
    mockSaveEvalConfig.mockReturnValue(cfg);

    const { PUT } = await loadRoute();
    const req = new Request("http://localhost/api/evals/config", {
      method: "PUT",
      body: JSON.stringify({ config: cfg }),
    });
    const response = await PUT(req as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.config).toBeTruthy();
    expect(mockSaveEvalConfig).toHaveBeenCalledOnce();
  });
});

describe("POST /api/evals/config (set active preset)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormatEvalConfigYaml.mockReturnValue("yaml: preset");
  });

  it("returns 403 when not authorized", async () => {
    mockAuthorizeRegistryWrite.mockReturnValue(false);

    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/evals/config", {
      method: "POST",
      body: JSON.stringify({ active_preset: "outcome-weighted" }),
    });
    const response = await POST(req as any);

    expect(response.status).toBe(403);
  });

  it("returns 400 when active_preset field is missing", async () => {
    mockAuthorizeRegistryWrite.mockReturnValue(true);

    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/evals/config", {
      method: "POST",
      body: JSON.stringify({ something_else: "x" }),
    });
    const response = await POST(req as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("active_preset");
  });

  it("returns 400 for unknown preset name", async () => {
    mockAuthorizeRegistryWrite.mockReturnValue(true);
    mockLoadEvalConfig.mockReturnValue(stubConfig());

    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/evals/config", {
      method: "POST",
      body: JSON.stringify({ active_preset: "nonexistent-preset" }),
    });
    const response = await POST(req as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Unknown preset");
  });

  it("accepts null to clear the active preset", async () => {
    mockAuthorizeRegistryWrite.mockReturnValue(true);
    const cfg = stubConfig({ activePreset: null });
    mockSetActivePreset.mockReturnValue(cfg);

    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/evals/config", {
      method: "POST",
      body: JSON.stringify({ active_preset: null }),
    });
    const response = await POST(req as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockSetActivePreset).toHaveBeenCalledWith(null);
  });

  it("accepts a known built-in preset name", async () => {
    mockAuthorizeRegistryWrite.mockReturnValue(true);
    mockLoadEvalConfig.mockReturnValue(stubConfig());
    const cfg = stubConfig({ activePreset: "outcome-weighted" });
    mockSetActivePreset.mockReturnValue(cfg);

    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/evals/config", {
      method: "POST",
      body: JSON.stringify({ active_preset: "outcome-weighted" }),
    });
    const response = await POST(req as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockSetActivePreset).toHaveBeenCalledWith("outcome-weighted");
  });
});

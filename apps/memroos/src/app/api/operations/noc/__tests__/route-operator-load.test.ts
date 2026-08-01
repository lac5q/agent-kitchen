// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = path.join(os.tmpdir(), `operations-noc-operator-load-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DIR, "noc.db");
function resolveWorkspaceRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "reports", "operator-load"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("workspace root with reports/operator-load not found");
}

const REPO_ROOT = resolveWorkspaceRoot();
const OPERATOR_LOAD_DIR = path.join(REPO_ROOT, "reports", "operator-load");
const LATEST_REPORT_PATH = path.join(OPERATOR_LOAD_DIR, "latest.json");

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const route = await import("../route");
  const dbModule = await import("@/lib/db");
  return { ...route, ...dbModule };
}

describe("GET /api/operations/noc operator load report", () => {
  let originalCwd: string;
  let hadLatestReport: boolean;
  let latestBackup: string | null = null;

  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(OPERATOR_LOAD_DIR, { recursive: true });
    originalCwd = process.cwd();
    hadLatestReport = fs.existsSync(LATEST_REPORT_PATH);
    if (hadLatestReport) {
      latestBackup = fs.readFileSync(LATEST_REPORT_PATH, "utf8");
    }
  });

  afterEach(async () => {
    const { closeDb } = await loadRoute();
    closeDb();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    process.chdir(originalCwd);
    if (hadLatestReport && latestBackup != null) {
      fs.writeFileSync(LATEST_REPORT_PATH, latestBackup);
    } else if (fs.existsSync(LATEST_REPORT_PATH)) {
      fs.rmSync(LATEST_REPORT_PATH, { force: true });
    }
    vi.resetModules();
  });

  it("surfaces a pass report from reports/operator-load/latest.json", async () => {
    const generatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(
      LATEST_REPORT_PATH,
      JSON.stringify({
        status: "pass",
        p95Ms: 180,
        errorRate: 0.0002,
        generatedAt,
        targetHost: "oracle-1",
        endpoint: "/api/knowledge",
        findings: ["within SLO"],
        manifest: { gitSha: "deadbeef" },
      })
    );

    const { GET } = await loadRoute();
    const body = await (await GET(new Request("http://localhost/api/operations/noc?window=24h"))).json();

    expect(body.operatorLoadStatus).toMatchObject({
      status: "pass",
      p95Ms: 180,
      errorRate: 0.0002,
      generatedAt,
      targetHost: "oracle-1",
      endpoint: "/api/knowledge",
      findings: ["within SLO"],
      gitSha: "deadbeef",
    });
    expect(body.operatorLoadStatus.ageHours).toBeGreaterThan(1.9);
    expect(body.panels.operatorLoad).toMatchObject({
      status: "live",
      source: "reports/operator-load/latest.json",
      lastUpdated: generatedAt,
      warnings: [],
    });
  });

  it("maps fail, unreachable, and baseline statuses into degraded panels", async () => {
    for (const status of ["fail", "unreachable", "baseline"] as const) {
      fs.writeFileSync(
        LATEST_REPORT_PATH,
        JSON.stringify({
          status,
          p95Ms: 900,
          errorRate: 0.05,
          generatedAt: new Date().toISOString(),
          targetHost: "oracle-1",
          endpoint: "/api/knowledge",
          findings: ["slo miss"],
        })
      );

      const { GET } = await loadRoute();
      const body = await (await GET(new Request("http://localhost/api/operations/noc"))).json();

      expect(body.operatorLoadStatus.status).toBe(status);
      expect(body.panels.operatorLoad.status).toBe("degraded");
      expect(body.panels.operatorLoad.warnings[0]).toContain(`"${status}"`);
      expect(body.panels.operatorLoad.warnings[0]).toContain("p95=900ms");
    }
  });

  it("falls back to missing when the report is malformed or uses an unknown status", async () => {
    fs.writeFileSync(LATEST_REPORT_PATH, "{not-json");

    const { GET } = await loadRoute();
    let body = await (await GET(new Request("http://localhost/api/operations/noc"))).json();
    expect(body.operatorLoadStatus.status).toBe("missing");
    expect(body.panels.operatorLoad.status).toBe("degraded");

    fs.writeFileSync(
      LATEST_REPORT_PATH,
      JSON.stringify({
        status: "mystery",
        generatedAt: "not-a-date",
        findings: "not-an-array",
        p95Ms: "slow",
      })
    );
    body = await (await GET(new Request("http://localhost/api/operations/noc"))).json();
    expect(body.operatorLoadStatus).toMatchObject({
      status: "missing",
      p95Ms: null,
      errorRate: null,
      generatedAt: "not-a-date",
      ageHours: null,
      findings: [],
      gitSha: null,
    });
  });

  it("uses findRepoRoot fallback when cwd has no reports/operator-load ancestor", async () => {
    const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), "noc-no-reports-"));
    process.chdir(isolatedDir);

    const { GET } = await loadRoute();
    const body = await (await GET(new Request("http://localhost/api/operations/noc"))).json();

    expect(body.operatorLoadStatus.status).toBe("missing");
    expect(body.panels.operatorLoad.status).toBe("degraded");
    fs.rmSync(isolatedDir, { recursive: true, force: true });
  });
});

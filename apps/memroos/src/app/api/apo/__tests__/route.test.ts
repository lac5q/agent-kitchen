// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root: string;
let proposalsPath: string;
let skillsPath: string;
let agentsPath: string;
let cronLogPath: string;

const proposalFilename = "APO_PROPOSAL_ceo_ceo_20260505_120000.md";
const proposalBody = `# Agent-Lightning APO Proposal
**Generated:** 2026-05-05T12:00:00
**Skill:** ceo

## Proposed Fix

**APO Constraint to add to SKILL.md:**
\`\`\`
CRITICAL: Check provider auth before retrying blocked work.
\`\`\`
`;

async function loadRoute() {
  vi.resetModules();
  vi.stubEnv("APO_PROPOSALS_PATH", proposalsPath);
  vi.stubEnv("APO_SKILLS_PATH", skillsPath);
  vi.stubEnv("APO_AGENT_CONFIGS_PATH", agentsPath);
  vi.stubEnv("APO_CRON_LOG_PATH", cronLogPath);
  return import("../route");
}

function makeApproveRequest(body: unknown, url = "http://localhost/api/apo") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/apo approve", () => {
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "apo-route-"));
    proposalsPath = path.join(root, "proposals");
    skillsPath = path.join(root, "skills");
    agentsPath = path.join(root, "agents");
    cronLogPath = path.join(root, "apo.log");
    mkdirSync(proposalsPath, { recursive: true });
    mkdirSync(path.join(skillsPath, "ceo"), { recursive: true });
    writeFileSync(path.join(proposalsPath, proposalFilename), proposalBody);
    writeFileSync(path.join(skillsPath, "ceo", "SKILL.md"), "# CEO Skill\n");
    writeFileSync(cronLogPath, "[2026-05-05 12:00:00] APO cycle\n");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("queues an approved proposal without mutating the target skill", async () => {
    const { POST } = await loadRoute();

    const response = await POST(makeApproveRequest({ action: "approve", proposalId: proposalFilename }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      proposalId: proposalFilename,
      skillId: "ceo",
      queued: true,
      targetKind: "skill",
      executorCli: "qwen",
    });
    expect(readFileSync(path.join(skillsPath, "ceo", "SKILL.md"), "utf-8")).not.toContain(
      "CRITICAL: Check provider auth before retrying blocked work."
    );
    expect(existsSync(path.join(proposalsPath, proposalFilename))).toBe(false);
    expect(existsSync(path.join(proposalsPath, "approved", proposalFilename))).toBe(true);
    expect(existsSync(path.join(proposalsPath, "approved", `${proposalFilename}.json`))).toBe(true);
  });

  it("lists queued approvals separately from pending and archived proposals", async () => {
    const { GET, POST } = await loadRoute();

    await POST(makeApproveRequest({ action: "approve", proposalId: proposalFilename }));
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stats).toMatchObject({ pendingProposals: 0, approvedProposals: 1, archivedProposals: 0 });
    expect(body.proposals[0]).toMatchObject({
      id: proposalFilename,
      status: "approved",
      tracking: {
        phase: "queued",
        label: "Queued for worker",
        executorCli: "qwen",
        targetKind: "skill",
        targetPath: path.join(skillsPath, "ceo", "SKILL.md"),
      },
    });
    expect(body.proposals[0].tracking.approvedAt).toEqual(expect.any(String));
  });

  it("applies queued approved proposals and archives them from the worker action", async () => {
    const { GET, POST } = await loadRoute();

    await POST(makeApproveRequest({ action: "approve", proposalId: proposalFilename }));
    const response = await POST(makeApproveRequest({ action: "process-approved" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, processed: 1, failed: 0 });
    expect(body.results[0]).toMatchObject({
      ok: true,
      proposalId: proposalFilename,
      skillId: "ceo",
      archived: true,
      applied: true,
      executorCli: "qwen",
    });
    expect(readFileSync(path.join(skillsPath, "ceo", "SKILL.md"), "utf-8")).toContain(
      "CRITICAL: Check provider auth before retrying blocked work."
    );
    expect(existsSync(path.join(proposalsPath, "approved", proposalFilename))).toBe(false);
    expect(existsSync(path.join(proposalsPath, "archived", proposalFilename))).toBe(true);

    const listResponse = await GET();
    const listBody = await listResponse.json();
    expect(listBody.stats).toMatchObject({ pendingProposals: 0, approvedProposals: 0, archivedProposals: 1 });
    expect(listBody.proposals[0]).toMatchObject({
      id: proposalFilename,
      status: "archived",
      tracking: {
        phase: "implemented",
        label: "Implemented",
        executorCli: "qwen",
        applied: true,
      },
    });
    expect(listBody.proposals[0].tracking.implementedAt).toEqual(expect.any(String));
  });

  it("rejects invalid proposal ids before touching the filesystem", async () => {
    const { POST } = await loadRoute();

    const response = await POST(makeApproveRequest({ action: "approve", proposalId: "../escape.md" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(existsSync(path.join(proposalsPath, proposalFilename))).toBe(true);
  });

  it("falls back to a matching PMO-style AGENTS.md when SKILL.md does not exist", async () => {
    const staffProposal = "APO_PROPOSAL_chief-of-staff_chief-of-staff_20260505_120000.md";
    rmSync(path.join(skillsPath, "ceo"), { recursive: true, force: true });
    mkdirSync(path.join(agentsPath, "chief_of_staff"), { recursive: true });
    writeFileSync(path.join(proposalsPath, staffProposal), proposalBody.replace("ceo", "chief-of-staff"));
    writeFileSync(path.join(agentsPath, "chief_of_staff", "AGENTS.md"), "# Chief of Staff Agent\n");
    const { POST } = await loadRoute();

    const response = await POST(makeApproveRequest({ action: "approve", proposalId: staffProposal }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, proposalId: staffProposal, skillId: "chief-of-staff", targetKind: "agent", queued: true });
    expect(readFileSync(path.join(agentsPath, "chief_of_staff", "AGENTS.md"), "utf-8")).not.toContain(
      "CRITICAL: Check provider auth before retrying blocked work."
    );

    const applyResponse = await POST(makeApproveRequest({ action: "apply-approved", proposalId: staffProposal }));
    expect(applyResponse.status).toBe(200);
    expect(readFileSync(path.join(agentsPath, "chief_of_staff", "AGENTS.md"), "utf-8")).toContain(
      "CRITICAL: Check provider auth before retrying blocked work."
    );
  });
});

describe("GET /api/apo", () => {
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "apo-route-get-"));
    proposalsPath = path.join(root, "proposals");
    skillsPath = path.join(root, "skills");
    agentsPath = path.join(root, "agents");
    cronLogPath = path.join(root, "apo.log");
    mkdirSync(proposalsPath, { recursive: true });
    mkdirSync(path.join(skillsPath, "ceo"), { recursive: true });
    writeFileSync(path.join(proposalsPath, proposalFilename), proposalBody);
    writeFileSync(path.join(skillsPath, "ceo", "SKILL.md"), "# CEO Skill\n");
    writeFileSync(cronLogPath, "[2026-05-05 12:00:00] APO cycle\n");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("lists pending proposals and parses cron log timestamps", async () => {
    const { GET } = await loadRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stats).toMatchObject({
      pendingProposals: 1,
      approvedProposals: 0,
      archivedProposals: 0,
      totalProposals: 1,
    });
    expect(body.proposals[0]).toMatchObject({
      id: proposalFilename,
      status: "pending",
      tracking: { phase: "pending", label: "Awaiting review" },
    });
    expect(body.stats.recentLogLines.length).toBeGreaterThan(0);
    expect(body.stats.lastRun).toEqual(expect.any(String));
  });

  it("falls back to cron log mtime when no run marker is present", async () => {
    writeFileSync(cronLogPath, "plain log line without markers\n");
    const { GET } = await loadRoute();
    const body = await (await GET()).json();
    expect(body.stats.lastRun).toEqual(expect.any(String));
  });
});

describe("POST /api/apo validation and errors", () => {
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "apo-route-post-"));
    proposalsPath = path.join(root, "proposals");
    skillsPath = path.join(root, "skills");
    agentsPath = path.join(root, "agents");
    cronLogPath = path.join(root, "apo.log");
    mkdirSync(proposalsPath, { recursive: true });
    mkdirSync(path.join(skillsPath, "ceo"), { recursive: true });
    writeFileSync(path.join(proposalsPath, proposalFilename), proposalBody);
    writeFileSync(path.join(skillsPath, "ceo", "SKILL.md"), "# CEO Skill\n");
    writeFileSync(cronLogPath, "[2026-05-05 12:00:00] APO cycle\n");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects remote writes without operator credentials", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      makeApproveRequest(
        { action: "approve", proposalId: proposalFilename },
        "https://memroos.example/api/apo",
      ),
    );
    expect(response.status).toBe(403);
  });

  it("rejects unknown actions and missing proposal ids", async () => {
    const { POST } = await loadRoute();

    const badAction = await POST(makeApproveRequest({ action: "launch", proposalId: proposalFilename }));
    expect(badAction.status).toBe(400);
    expect((await badAction.json()).error).toContain("action must be approve");

    const missingId = await POST(makeApproveRequest({ action: "approve" }));
    expect(missingId.status).toBe(400);
    expect((await missingId.json()).error).toBe("proposalId is required");
  });

  it("returns 404 when proposal or target is missing", async () => {
    const { POST } = await loadRoute();

    const missingProposal = await POST(
      makeApproveRequest({ action: "approve", proposalId: "APO_PROPOSAL_missing_skill_x_20260505_120000.md" }),
    );
    expect(missingProposal.status).toBe(404);

    const noConstraint = "APO_PROPOSAL_plain_plain_20260505_120000.md";
    writeFileSync(path.join(proposalsPath, noConstraint), "# No constraint block\n");
    const missingConstraint = await POST(makeApproveRequest({ action: "approve", proposalId: noConstraint }));
    expect(missingConstraint.status).toBe(422);

    rmSync(path.join(skillsPath, "ceo"), { recursive: true, force: true });
    const missingTarget = await POST(makeApproveRequest({ action: "approve", proposalId: proposalFilename }));
    expect(missingTarget.status).toBe(404);
    expect((await missingTarget.json()).searched.skillRoots).toEqual(expect.any(Array));
  });

  it("uses custom executor CLI and skips re-applying an existing constraint", async () => {
    const { POST } = await loadRoute();

    const approve = await POST(
      makeApproveRequest({
        action: "approve",
        proposalId: proposalFilename,
        executorCli: " codex ",
      }),
    );
    expect(approve.status).toBe(200);
    expect((await approve.json()).executorCli).toBe("codex");

    const constraint = "CRITICAL: Check provider auth before retrying blocked work.";
    writeFileSync(
      path.join(skillsPath, "ceo", "SKILL.md"),
      `# CEO Skill\n${constraint}\n`,
    );

    const apply = await POST(
      makeApproveRequest({ action: "apply-approved", proposalId: proposalFilename, executorCli: "codex" }),
    );
    expect(apply.status).toBe(200);
    expect((await apply.json()).applied).toBe(false);
  });

  it("process-approved honors limit and archived tracking labels applied=false", async () => {
    const { GET, POST } = await loadRoute();
    await POST(makeApproveRequest({ action: "approve", proposalId: proposalFilename }));

    const constraint = "CRITICAL: Check provider auth before retrying blocked work.";
    writeFileSync(
      path.join(skillsPath, "ceo", "SKILL.md"),
      `# CEO Skill\n${constraint}\n`,
    );

    const processed = await POST(makeApproveRequest({ action: "process-approved", limit: 1 }));
    expect(processed.status).toBe(200);
    expect((await processed.json()).processed).toBe(1);

    const list = await (await GET()).json();
    expect(list.proposals[0]).toMatchObject({
      status: "archived",
      tracking: { label: "Archived", applied: false },
    });
  });
});

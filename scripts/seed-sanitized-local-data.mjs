#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "2026-07-18.1";
const FIXTURE_DATE = "2026-07-18T07:21:31.000Z";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.join(repoRoot, "apps", "memroos", "data", "uat-fixtures");

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fakeId(prefix, seed) {
  return `${prefix}_${sha256(seed).slice(0, 12)}`;
}

const tenantId = "tenant_uat_sandbox";

const users = [
  {
    id: fakeId("user", "admin"),
    tenantId,
    email: "admin.uat@example.test",
    displayName: "UAT Admin",
    role: "admin",
    createdAt: "2026-07-01T09:00:00.000Z",
    lastLoginAt: "2026-07-18T06:45:00.000Z",
    notes: "Synthetic human admin for team, compliance, vault, and invite UAT.",
  },
  {
    id: fakeId("user", "operator"),
    tenantId,
    email: "operator.uat@example.test",
    displayName: "UAT Operator",
    role: "operator",
    createdAt: "2026-07-02T09:00:00.000Z",
    lastLoginAt: "2026-07-18T06:50:00.000Z",
    notes: "Synthetic human operator for memory, dispatch, evals, and SEAL UAT.",
  },
  {
    id: fakeId("user", "reviewer"),
    tenantId,
    email: "reviewer.uat@example.test",
    displayName: "UAT Reviewer",
    role: "reviewer",
    createdAt: "2026-07-03T09:00:00.000Z",
    lastLoginAt: null,
    notes: "Synthetic lowest human role; use when checking operator/admin denial paths.",
  },
];

const agents = [
  {
    id: "agent_atlas_dispatcher",
    tenantId,
    name: "Atlas Dispatcher",
    role: "agent",
    platform: "cursor-cloud",
    protocol: "memroos-agent-v1",
    status: "active",
    ownerUserId: users[1].id,
    capabilities: ["dispatch", "agent-context", "heartbeat"],
    riskTier: "medium",
    card: {
      description: "Routes synthetic UAT tasks to safe local agents.",
      version: "1.4.0-uat",
      endpoints: ["/api/dispatch", "/api/heartbeat", "/api/agent-context"],
    },
  },
  {
    id: "agent_nova_memory_curator",
    tenantId,
    name: "Nova Memory Curator",
    role: "agent",
    platform: "local-node",
    protocol: "memroos-memory-v1",
    status: "active",
    ownerUserId: users[1].id,
    capabilities: ["memory-search", "memory-add", "graph-catchup"],
    riskTier: "low",
    card: {
      description: "Exercises memory browse/search/lifecycle paths with fake facts only.",
      version: "2.1.0-uat",
      endpoints: ["/api/memory/search", "/api/memory/add", "/api/memory-lifecycle/graph-catchup"],
    },
  },
  {
    id: "agent_seal_review_bot",
    tenantId,
    name: "SEAL Review Bot",
    role: "agent",
    platform: "sandbox",
    protocol: "seal-review-v1",
    status: "limited",
    ownerUserId: users[0].id,
    capabilities: ["seal-evidence", "proposal-summarize"],
    riskTier: "high",
    card: {
      description: "Creates review-only SEAL evidence for self-improvement UAT.",
      version: "0.9.0-uat",
      endpoints: ["/api/seal/proposals", "/api/seal/jobs/job_uat_001/evidence"],
    },
  },
  {
    id: "agent_field_a2a",
    tenantId,
    name: "Field A2A Simulator",
    role: "agent",
    platform: "a2a",
    protocol: "a2a",
    status: "active",
    ownerUserId: users[1].id,
    capabilities: ["a2a-card", "public-v1-traces"],
    riskTier: "medium",
    card: {
      description: "Simulates external A2A/public API contract calls.",
      version: "1.0.0-uat",
      endpoints: ["/api/a2a/openapi", "/api/public/v1/traces"],
    },
  },
];

const memories = [
  {
    id: fakeId("mem", "runbook-login"),
    tenantId,
    agentId: agents[0].id,
    subjectId: "subject_uat_console",
    type: "runbook",
    visibility: "tenant",
    content: "Synthetic runbook: when console health shows degraded optional services, continue UAT with local fixtures.",
    tags: ["operations", "degraded-services", "uat"],
    createdAt: "2026-07-10T10:00:00.000Z",
    retention: { policy: "default_90d", legalHold: false, expiresAt: "2026-10-08T10:00:00.000Z" },
  },
  {
    id: fakeId("mem", "skill-risk"),
    tenantId,
    agentId: agents[2].id,
    subjectId: "subject_uat_skills",
    type: "decision",
    visibility: "restricted",
    content: "Synthetic decision: high-risk skill proposals require human approval before dispatch.",
    tags: ["skills", "risk", "approval"],
    createdAt: "2026-07-11T10:00:00.000Z",
    retention: { policy: "default_90d", legalHold: false, expiresAt: "2026-10-09T10:00:00.000Z" },
  },
  {
    id: fakeId("mem", "legal-hold"),
    tenantId,
    agentId: agents[1].id,
    subjectId: "subject_uat_hold",
    type: "policy",
    visibility: "tenant",
    content: "Synthetic policy: legal hold prevents expiry and subject erasure for held UAT records.",
    tags: ["memory-lifecycle", "legal-hold", "dsar"],
    createdAt: "2026-07-12T10:00:00.000Z",
    retention: { policy: "legal_hold", legalHold: true, expiresAt: null },
  },
  {
    id: fakeId("mem", "dispatch-handoff"),
    tenantId,
    agentId: agents[0].id,
    subjectId: "subject_uat_dispatch",
    type: "handoff",
    visibility: "tenant",
    content: "Synthetic handoff: Atlas Dispatcher assigned memory search validation to Nova Memory Curator.",
    tags: ["dispatch", "handoff", "agent-context"],
    createdAt: "2026-07-13T10:00:00.000Z",
    retention: { policy: "default_90d", legalHold: false, expiresAt: "2026-10-11T10:00:00.000Z" },
  },
  {
    id: fakeId("mem", "public-approved"),
    tenantId,
    agentId: agents[3].id,
    subjectId: "subject_uat_public",
    type: "source_pointer",
    visibility: "public_approved",
    content: "Synthetic public-approved memory for OpenAPI and public trace contract testing.",
    tags: ["public-v1", "openapi", "trace"],
    createdAt: "2026-07-14T10:00:00.000Z",
    retention: { policy: "default_90d", legalHold: false, expiresAt: "2026-10-12T10:00:00.000Z" },
  },
  {
    id: fakeId("mem", "duplicate-a"),
    tenantId,
    agentId: agents[1].id,
    subjectId: "subject_uat_dedupe",
    type: "lesson",
    visibility: "tenant",
    content: "Synthetic duplicate candidate: memory dedupe should preserve distinct IDs or merge predictably.",
    tags: ["memory", "dedupe"],
    createdAt: "2026-07-15T10:00:00.000Z",
    retention: { policy: "default_90d", legalHold: false, expiresAt: "2026-10-13T10:00:00.000Z" },
  },
  {
    id: fakeId("mem", "duplicate-b"),
    tenantId,
    agentId: agents[1].id,
    subjectId: "subject_uat_dedupe",
    type: "lesson",
    visibility: "tenant",
    content: "Synthetic duplicate candidate: memory dedupe should preserve distinct IDs or merge predictably.",
    tags: ["memory", "dedupe"],
    createdAt: "2026-07-15T10:05:00.000Z",
    retention: { policy: "default_90d", legalHold: false, expiresAt: "2026-10-13T10:05:00.000Z" },
  },
];

const apiKeys = [
  {
    id: fakeId("key", "operator-ci"),
    userId: users[1].id,
    label: "Synthetic CI key metadata only",
    prefix: "mr_uat_op_",
    createdAt: "2026-07-16T08:00:00.000Z",
    lastUsedAt: null,
    rawSecretIncluded: false,
  },
  {
    id: fakeId("key", "agent-runtime"),
    userId: users[1].id,
    label: "Synthetic agent runtime key metadata only",
    prefix: "mr_uat_agent_",
    createdAt: "2026-07-16T08:30:00.000Z",
    lastUsedAt: "2026-07-18T06:00:00.000Z",
    rawSecretIncluded: false,
  },
];

const skills = [
  {
    id: fakeId("skill", "safe-memory-search"),
    name: "safe-memory-search",
    sourceHarness: "cursor",
    owner: "UAT Operator",
    riskTier: "low",
    completenessPct: 100,
    dispatchStatus: "enabled",
    missingFields: [],
  },
  {
    id: fakeId("skill", "seal-self-edit"),
    name: "seal-self-edit-review",
    sourceHarness: "sandbox",
    owner: "UAT Admin",
    riskTier: "high",
    completenessPct: 72,
    dispatchStatus: "incomplete",
    missingFields: ["rollback_plan", "human_approval_gate"],
  },
  {
    id: fakeId("skill", "quarantined-import"),
    name: "quarantined-import-example",
    sourceHarness: "external",
    owner: "UAT Operator",
    riskTier: "critical",
    completenessPct: 40,
    dispatchStatus: "disabled",
    missingFields: ["signature", "owner", "risk_controls"],
  },
];

const governance = {
  auditEntries: [
    {
      id: fakeId("audit", "compliance-update"),
      tenantId,
      actorId: users[0].id,
      actorRole: "admin",
      eventType: "admin.compliance.updated",
      entityType: "compliance_control",
      entityId: "compliance:runtime",
      reason: "Synthetic compliance posture update for UAT.",
      createdAt: "2026-07-17T12:00:00.000Z",
    },
    {
      id: fakeId("audit", "skill-quarantine"),
      tenantId,
      actorId: users[1].id,
      actorRole: "operator",
      eventType: "skill.quarantined",
      entityType: "skill",
      entityId: skills[2].id,
      reason: "Synthetic unsigned skill import quarantined.",
      createdAt: "2026-07-17T12:30:00.000Z",
    },
  ],
  escalations: [
    {
      id: fakeId("esc", "memory-legal-hold"),
      tenantId,
      severity: "high",
      status: "open",
      entityType: "memory",
      entityId: memories[2].id,
      summary: "Synthetic legal hold blocks erasure request.",
      createdAt: "2026-07-17T13:00:00.000Z",
    },
    {
      id: fakeId("esc", "seal-review"),
      tenantId,
      severity: "medium",
      status: "resolved",
      entityType: "seal_proposal",
      entityId: "proposal_uat_seal_001",
      summary: "Synthetic SEAL proposal required reviewer notes.",
      createdAt: "2026-07-17T14:00:00.000Z",
      resolvedAt: "2026-07-17T15:00:00.000Z",
    },
  ],
  compliance: {
    dataResidencyEnabled: true,
    auditRetentionDays: 365,
    enabledAdapters: ["sqlite-local", "json-fixtures"],
    judgeProvider: "local",
    judgeModelFamily: "synthetic-uat",
  },
};

const operations = {
  serviceHealth: [
    { name: "sqlite", status: "ok", message: "Embedded local store available." },
    { name: "mem0", status: "degraded", message: "Optional service intentionally absent for local UAT." },
    { name: "qdrant", status: "degraded", message: "Optional vector store intentionally absent for local UAT." },
    { name: "voice", status: "degraded", message: "Optional voice integration intentionally absent for local UAT." },
  ],
  modelUsage: [
    { provider: "synthetic", model: "uat-fast", inputTokens: 12400, outputTokens: 3100, costUsd: 0 },
    { provider: "synthetic", model: "uat-review", inputTokens: 8200, outputTokens: 2200, costUsd: 0 },
  ],
  timeSeries: [
    { bucket: "2026-07-18T06:00:00.000Z", metric: "memory_searches", value: 18 },
    { bucket: "2026-07-18T06:00:00.000Z", metric: "dispatches", value: 5 },
    { bucket: "2026-07-18T06:00:00.000Z", metric: "escalations_opened", value: 1 },
  ],
};

const workflows = [
  {
    id: "workflow_public_to_login",
    name: "Public discovery to login",
    routes: ["/", "/platform", "/use-cases", "/vs", "/blog", "/login"],
    personas: ["prospect", "admin", "operator"],
    expectedResult: "Public pages render on marketing host; protected app pages require login.",
  },
  {
    id: "workflow_admin_invite",
    name: "Admin invite and registration",
    routes: ["/team", "/invite/[token]", "/register"],
    apis: ["/api/auth/invite", "/api/auth/invite/[token]", "/api/auth/register"],
    personas: ["admin", "invitee"],
    expectedResult: "One-time invite creates correct role and rejects reuse.",
  },
  {
    id: "workflow_memory_lifecycle",
    name: "Memory lifecycle compliance",
    routes: ["/notebooks", "/library", "/settings/compliance"],
    apis: ["/api/memory/search", "/api/memory-lifecycle/legal-holds", "/api/memory-lifecycle/subject-erasure"],
    personas: ["admin", "operator", "agent"],
    expectedResult: "Legal hold and DSAR paths are auditable and authorization-gated.",
  },
  {
    id: "workflow_skill_governance",
    name: "Skill governance",
    routes: ["/cookbooks", "/skills"],
    apis: ["/api/skills/import", "/api/skills/quarantine", "/api/skills/proposals"],
    personas: ["operator", "agent"],
    expectedResult: "Incomplete or quarantined skills cannot dispatch.",
  },
  {
    id: "workflow_agent_runtime",
    name: "Agent runtime handoff",
    routes: ["/agents", "/flow", "/dispatch"],
    apis: ["/api/agents/register", "/api/agent-context/messages", "/api/agent-memory/handoff"],
    personas: ["operator", "agent"],
    expectedResult: "Registered agents can ACK/reply/handoff within scoped permissions.",
  },
];

const files = {
  "manifest.json": {
    version: VERSION,
    generatedAt: FIXTURE_DATE,
    fixtureRoot,
    safety: {
      syntheticOnly: true,
      pii: false,
      productionAccess: false,
      networkAccess: false,
      databaseWrites: false,
      idempotent: "Re-running overwrites the same local JSON fixture files.",
    },
    routeScope: {
      pages: 35,
      apis: 211,
      source: "/tmp/uat-routes.json",
    },
  },
  "users.json": users,
  "agents.json": agents,
  "memories.json": memories,
  "api-keys.json": apiKeys,
  "skills.json": skills,
  "governance.json": governance,
  "operations.json": operations,
  "workflows.json": workflows,
};

async function main() {
  await mkdir(fixtureRoot, { recursive: true });

  const written = [];
  for (const [filename, data] of Object.entries(files)) {
    const body = stableJson(data);
    const target = path.join(fixtureRoot, filename);
    await writeFile(target, body, "utf8");
    written.push({
      file: path.relative(repoRoot, target),
      bytes: Buffer.byteLength(body),
      sha256: sha256(body),
    });
  }

  const summary = {
    ok: true,
    version: VERSION,
    generatedAt: FIXTURE_DATE,
    fixtureRoot: path.relative(repoRoot, fixtureRoot),
    safety: {
      syntheticOnly: true,
      productionAccess: false,
      networkAccess: false,
      databaseWrites: false,
    },
    counts: {
      users: users.length,
      agents: agents.length,
      memories: memories.length,
      apiKeys: apiKeys.length,
      skills: skills.length,
      auditEntries: governance.auditEntries.length,
      escalations: governance.escalations.length,
      workflows: workflows.length,
      files: written.length,
    },
    written,
  };

  process.stdout.write(stableJson(summary));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(stableJson({ ok: false, error: message }));
  process.exitCode = 1;
});

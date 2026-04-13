// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return { ...actual, readFile: vi.fn(), readdir: vi.fn() };
});

vi.mock("@/lib/constants", () => ({
  SKILLS_PATH: "/tmp/test-skills",
  SKILL_CONTRIBUTIONS_LOG: "/tmp/test-skill-contributions.jsonl",
  FAILURES_LOG: "/tmp/test-failures.log",
}));

const { GET } = await import("../route");
const { readFile, readdir } = await import("fs/promises");

const mockReadFile = vi.mocked(readFile);
const mockReaddir = vi.mocked(readdir);

// Helper: create a fake DirEntry
function makeDirEntry(name: string, isDirectory: boolean) {
  return { name, isDirectory: () => isDirectory, isFile: () => !isDirectory } as Awaited<ReturnType<typeof readdir>>[number];
}

// Helper: build JSONL string from event objects
function makeJsonl(events: object[]): string {
  return events.map(e => JSON.stringify(e)).join("\n");
}

// Helper: build a failure entry JSON string (single-line)
function makeFailureEntry(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    timestamp: "2026-04-13T10:00:00Z",
    agent_id: "hermes",
    error_type: "permission_denied",
    ...overrides,
  });
}

// Helper: build a multi-line pretty-printed failure entry
function makeMultiLineFailureEntry(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      timestamp: "2026-04-13T10:00:00Z",
      agent_id: "gwen",
      error_type: "timeout",
      ...overrides,
    },
    null,
    2
  );
}

const FAKE_STATE = JSON.stringify({
  last_sync: "2026-04-11T04:00:15.000000",
  last_prune: "2026-04-06T05:00:08.000000",
});

// Convenience: ENOENT error factory
const enoent = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/skills", () => {
  // NOTE: readFile call order in route is: (1) state file, (2) JSONL, (3) failures.log
  // Tests using mockRejectedValue (non-Once) cover all calls including failures.log.
  // Tests using chained mockXxxOnce need 3 entries.

  it("returns HTTP 200", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile.mockRejectedValue(enoent());
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("counts skills directories excluding dot-prefixed dirs and non-directories", async () => {
    mockReaddir.mockResolvedValue([
      makeDirEntry("bash-scripting", true),
      makeDirEntry("python-async", true),
      makeDirEntry(".hermes-staging", true),  // excluded: dot-prefix
      makeDirEntry("audit-report.md", false),  // excluded: not a directory
    ] as never);
    mockReadFile.mockRejectedValue(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.totalSkills).toBe(2);
  });

  it("returns totalSkills=0 when skills directory is inaccessible", async () => {
    mockReaddir.mockRejectedValue(enoent());
    mockReadFile.mockRejectedValue(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.totalSkills).toBe(0);
  });

  it("returns all contribution zeros when JSONL file does not exist", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile
      .mockRejectedValueOnce(enoent()) // (1) state file
      .mockRejectedValueOnce(enoent()) // (2) JSONL
      .mockRejectedValueOnce(enoent()); // (3) failures.log
    const res = await GET();
    const body = await res.json();
    expect(body.contributedByHermes).toBe(0);
    expect(body.contributedByGwen).toBe(0);
    expect(body.staleCandidates).toBe(0);
    expect(body.recentContributions).toEqual([]);
  });

  it("returns all zeros when JSONL file is empty", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile
      .mockRejectedValueOnce(enoent())      // (1) state
      .mockResolvedValueOnce("" as never)   // (2) empty JSONL
      .mockRejectedValueOnce(enoent());     // (3) failures.log
    const res = await GET();
    const body = await res.json();
    expect(body.contributedByHermes).toBe(0);
    expect(body.contributedByGwen).toBe(0);
    expect(body.staleCandidates).toBe(0);
  });

  it("counts hermes and gwen contributed events separately", async () => {
    mockReaddir.mockResolvedValue([]);
    const events = [
      { skill: "bash-scripting", action: "contributed", contributor: "hermes", timestamp: new Date().toISOString(), metadata: {} },
      { skill: "python-async",   action: "contributed", contributor: "hermes", timestamp: new Date().toISOString(), metadata: {} },
      { skill: "gwen-skill-01",  action: "contributed", contributor: "gwen",   timestamp: new Date().toISOString(), metadata: {} },
      { skill: "old-skill",      action: "contributed", contributor: "master",  timestamp: new Date().toISOString(), metadata: {} },
    ];
    mockReadFile
      .mockRejectedValueOnce(enoent())                        // (1) state
      .mockResolvedValueOnce(makeJsonl(events) as never)      // (2) JSONL
      .mockRejectedValueOnce(enoent());                       // (3) failures.log
    const res = await GET();
    const body = await res.json();
    expect(body.contributedByHermes).toBe(2);
    expect(body.contributedByGwen).toBe(1);
  });

  it("does NOT count pruned/archived events toward hermes or gwen contributed tallies", async () => {
    mockReaddir.mockResolvedValue([]);
    const events = [
      { skill: "bash-scripting", action: "contributed", contributor: "hermes", timestamp: new Date().toISOString(), metadata: {} },
      { skill: "stale-skill",    action: "pruned",       contributor: "hermes", timestamp: new Date().toISOString(), metadata: {} },
      { skill: "archived-skill", action: "archived",     contributor: "hermes", timestamp: new Date().toISOString(), metadata: {} },
    ];
    mockReadFile
      .mockRejectedValueOnce(enoent())
      .mockResolvedValueOnce(makeJsonl(events) as never)
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.contributedByHermes).toBe(1); // only the "contributed" one
  });

  it("counts all pruned events as staleCandidates", async () => {
    mockReaddir.mockResolvedValue([]);
    const events = [
      { skill: "stale-a", action: "pruned", contributor: "hermes", timestamp: new Date().toISOString(), metadata: {} },
      { skill: "stale-b", action: "pruned", contributor: "hermes", timestamp: new Date().toISOString(), metadata: {} },
      { skill: "active",  action: "contributed", contributor: "hermes", timestamp: new Date().toISOString(), metadata: {} },
    ];
    mockReadFile
      .mockRejectedValueOnce(enoent())
      .mockResolvedValueOnce(makeJsonl(events) as never)
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.staleCandidates).toBe(2);
  });

  it("returns only events from last 2 hours in recentContributions", async () => {
    mockReaddir.mockResolvedValue([]);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000 - 5000).toISOString(); // 5s before cutoff
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const events = [
      { skill: "old-skill",    action: "contributed", contributor: "hermes", timestamp: twoHoursAgo, metadata: {} },
      { skill: "recent-skill", action: "contributed", contributor: "hermes", timestamp: recent,      metadata: {} },
    ];
    mockReadFile
      .mockRejectedValueOnce(enoent())
      .mockResolvedValueOnce(makeJsonl(events) as never)
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.recentContributions).toHaveLength(1);
    expect(body.recentContributions[0].skill).toBe("recent-skill");
  });

  it("reads lastPruned from state file last_prune field", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile
      .mockResolvedValueOnce(FAKE_STATE as never)  // (1) state file
      .mockRejectedValueOnce(enoent())             // (2) JSONL
      .mockRejectedValueOnce(enoent());            // (3) failures.log
    const res = await GET();
    const body = await res.json();
    expect(body.lastPruned).toBe("2026-04-06T05:00:08.000000");
  });

  it("returns lastPruned=null when state file is inaccessible", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile.mockRejectedValue(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.lastPruned).toBeNull();
  });

  it("skips malformed JSONL lines without crashing", async () => {
    mockReaddir.mockResolvedValue([]);
    const mixedLines = [
      JSON.stringify({ skill: "good-skill", action: "contributed", contributor: "hermes", timestamp: new Date().toISOString(), metadata: {} }),
      "NOT VALID JSON {{{{",
      "",
      JSON.stringify({ skill: "also-good", action: "contributed", contributor: "gwen", timestamp: new Date().toISOString(), metadata: {} }),
    ].join("\n");
    mockReadFile
      .mockRejectedValueOnce(enoent())
      .mockResolvedValueOnce(mixedLines as never)
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.contributedByHermes).toBe(1);
    expect(body.contributedByGwen).toBe(1);
  });

  it("always includes a timestamp field in the response", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile.mockRejectedValue(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.timestamp).toBeDefined();
    expect(() => new Date(body.timestamp)).not.toThrow();
  });
});

describe("failuresByAgent + failuresByErrorType (SKILL-06)", () => {
  // readFile order: (1) state, (2) JSONL, (3) failures.log

  it("Test 1 (happy path): returns correct failure counts from failures.log", async () => {
    mockReaddir.mockResolvedValue([]);
    const failureEntries = [
      makeFailureEntry({ agent_id: "hermes", error_type: "permission_denied" }),
      makeFailureEntry({ agent_id: "hermes", error_type: "timeout" }),
      makeFailureEntry({ agent_id: "gwen",   error_type: "permission_denied" }),
      makeFailureEntry({ agent_id: "gwen",   error_type: "file_not_found" }),
      makeFailureEntry({ agent_id: "alba",   error_type: "timeout" }),
    ].join("\n");
    mockReadFile
      .mockRejectedValueOnce(enoent())                            // (1) state
      .mockRejectedValueOnce(enoent())                            // (2) JSONL
      .mockResolvedValueOnce(failureEntries as never);             // (3) failures.log
    const res = await GET();
    const body = await res.json();
    expect(body.failuresByAgent).toEqual({ hermes: 2, gwen: 2, alba: 1 });
    expect(body.failuresByErrorType).toEqual({ permission_denied: 2, timeout: 2, file_not_found: 1 });
  });

  it("Test 2 (disk_critical filtered): disk_critical never appears in response", async () => {
    mockReaddir.mockResolvedValue([]);
    const failureEntries = [
      makeFailureEntry({ agent_id: "hermes", error_type: "disk_critical" }),
      makeFailureEntry({ agent_id: "hermes", error_type: "disk_critical" }),
      makeFailureEntry({ agent_id: "hermes", error_type: "disk_critical" }),
      makeFailureEntry({ agent_id: "gwen",   error_type: "permission_denied" }),
      makeFailureEntry({ agent_id: "gwen",   error_type: "permission_denied" }),
    ].join("\n");
    mockReadFile
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(enoent())
      .mockResolvedValueOnce(failureEntries as never);
    const res = await GET();
    const body = await res.json();
    expect(body.failuresByErrorType).toEqual({ permission_denied: 2 });
    expect(body.failuresByErrorType).not.toHaveProperty("disk_critical");
    // disk_critical agents are excluded from agent count too (entries filtered before counting)
    expect(body.failuresByAgent).toEqual({ gwen: 2 });
  });

  it("Test 3 (missing log file): returns 200 with empty objects when failures.log absent", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile
      .mockRejectedValueOnce(enoent())  // (1) state
      .mockRejectedValueOnce(enoent())  // (2) JSONL
      .mockRejectedValueOnce(enoent()); // (3) failures.log — missing
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failuresByAgent).toEqual({});
    expect(body.failuresByErrorType).toEqual({});
  });

  it("Test 4 (empty log file): returns empty objects when failures.log is 0 bytes", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile
      .mockRejectedValueOnce(enoent())         // (1) state
      .mockRejectedValueOnce(enoent())         // (2) JSONL
      .mockResolvedValueOnce("" as never);     // (3) failures.log — empty
    const res = await GET();
    const body = await res.json();
    expect(body.failuresByAgent).toEqual({});
    expect(body.failuresByErrorType).toEqual({});
  });

  it("Test 5 (multi-line round-trip): pretty-printed multi-line entry counted as 1, not per-line", async () => {
    mockReaddir.mockResolvedValue([]);
    // A pretty-printed entry spans many lines — naive parser would count each line or crash
    const multiLineEntry = makeMultiLineFailureEntry({ agent_id: "gwen", error_type: "timeout" });
    expect(multiLineEntry.split("\n").length).toBeGreaterThan(1);
    mockReadFile
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(enoent())
      .mockResolvedValueOnce(multiLineEntry as never);
    const res = await GET();
    const body = await res.json();
    // Must be exactly 1 gwen failure, not 8 (one per line of the pretty-printed object)
    expect(body.failuresByAgent).toEqual({ gwen: 1 });
    expect(body.failuresByErrorType).toEqual({ timeout: 1 });
  });

  it("Test 6 (no regression): Phase 9 + 13 fields still present with correct values", async () => {
    mockReaddir.mockResolvedValue([
      makeDirEntry("bash-scripting", true),
      makeDirEntry("python-async", true),
    ] as never);
    const events = [
      { skill: "bash-scripting", action: "contributed", contributor: "hermes", timestamp: new Date().toISOString(), metadata: {} },
      { skill: "gwen-skill",     action: "contributed", contributor: "gwen",   timestamp: new Date().toISOString(), metadata: {} },
    ];
    mockReadFile
      .mockResolvedValueOnce(FAKE_STATE as never)
      .mockResolvedValueOnce(makeJsonl(events) as never)
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    // Phase 9 fields
    expect(body.totalSkills).toBe(2);
    expect(body.contributedByHermes).toBe(1);
    expect(body.contributedByGwen).toBe(1);
    expect(body.lastPruned).toBe("2026-04-06T05:00:08.000000");
    expect(body.lastUpdated).toBe("2026-04-11T04:00:15.000000");
    expect(body.timestamp).toBeDefined();
    // Phase 13 fields
    expect(Array.isArray(body.coverageGaps)).toBe(true);
    // Phase 14 new fields
    expect(body.failuresByAgent).toEqual({});
    expect(body.failuresByErrorType).toEqual({});
  });
});

describe("coverageGaps", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // NOTE: these tests use 2-entry chains (state + JSONL).
  // The failures.log call (3rd) falls through to mockRejectedValue default or gets undefined.
  // We add a third rejection to be safe where chains are explicit.

  it("includes skills never used", async () => {
    mockReaddir.mockResolvedValue([
      makeDirEntry("bash-scripting", true),
      makeDirEntry("python-async", true),
    ] as never);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify({ last_sync: "2026-04-11T04:00:15.000000", last_prune: "2026-04-06T05:00:08.000000", skill_usage: {} }) as never)
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    expect(new Set(body.coverageGaps)).toEqual(new Set(["bash-scripting", "python-async"]));
  });

  it("includes skills unused for 30+ days and excludes fresh skills", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T00:00:00Z"));
    mockReaddir.mockResolvedValue([
      makeDirEntry("stale-skill", true),
      makeDirEntry("fresh-skill", true),
    ] as never);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify({
        last_sync: "2026-04-11T04:00:15.000000",
        last_prune: "2026-04-06T05:00:08.000000",
        skill_usage: {
          "stale-skill": "2026-03-01T00:00:00Z",  // 43 days ago
          "fresh-skill": "2026-04-10T00:00:00Z",  // 3 days ago
        },
      }) as never)
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.coverageGaps).toContain("stale-skill");
    expect(body.coverageGaps).not.toContain("fresh-skill");
  });

  it("excludes skills used exactly at the 30-day boundary (strictly > 30 days is stale)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T00:00:00Z"));

    // boundary-skill used exactly 30 days ago (March 14 = 30 days before April 13)
    mockReaddir.mockResolvedValue([makeDirEntry("boundary-skill", true)] as never);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify({
        skill_usage: { "boundary-skill": "2026-03-14T00:00:00Z" },
      }) as never)
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.coverageGaps).not.toContain("boundary-skill");

    // Now: skill used just over 30 days ago (March 13 23:59:59 = 30d+1s)
    vi.clearAllMocks();
    mockReaddir.mockResolvedValue([makeDirEntry("boundary-skill", true)] as never);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify({
        skill_usage: { "boundary-skill": "2026-03-13T23:59:59Z" },
      }) as never)
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(enoent());
    const res2 = await GET();
    const body2 = await res2.json();
    expect(body2.coverageGaps).toContain("boundary-skill");
  });

  it("falls back to full skill list when skill-sync-state.json is missing", async () => {
    mockReaddir.mockResolvedValue([
      makeDirEntry("a", true),
      makeDirEntry("b", true),
      makeDirEntry("c", true),
    ] as never);
    mockReadFile
      .mockRejectedValueOnce(enoent())   // (1) state file
      .mockRejectedValueOnce(enoent())   // (2) JSONL
      .mockRejectedValueOnce(enoent());  // (3) failures.log
    const res = await GET();
    const body = await res.json();
    expect(new Set(body.coverageGaps)).toEqual(new Set(["a", "b", "c"]));
  });

  it("falls back to full skill list when skill_usage key is absent from state", async () => {
    mockReaddir.mockResolvedValue([
      makeDirEntry("a", true),
      makeDirEntry("b", true),
    ] as never);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify({ last_sync: "2026-04-11T04:00:15.000000", last_prune: "2026-04-06T05:00:08.000000" }) as never)
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    expect(new Set(body.coverageGaps)).toEqual(new Set(["a", "b"]));
  });

  it("returns [] when SKILLS_PATH is inaccessible", async () => {
    mockReaddir.mockRejectedValue(enoent());
    mockReadFile
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.coverageGaps).toEqual([]);
  });

  it("ignores dot-prefixed and non-directory entries", async () => {
    mockReaddir.mockResolvedValue([
      makeDirEntry("real-skill", true),
      makeDirEntry(".staging", true),
      makeDirEntry("notes.md", false),
    ] as never);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify({ skill_usage: {} }) as never)
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.coverageGaps).toEqual(["real-skill"]);
  });

  it("tolerates malformed skill_usage entries — treats bad-date as stale gap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T00:00:00Z"));
    mockReaddir.mockResolvedValue([
      makeDirEntry("ok-skill", true),
      makeDirEntry("bad-skill", true),
    ] as never);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify({
        skill_usage: {
          "ok-skill": "2026-04-10T00:00:00Z",  // 3 days ago — fresh
          "bad-skill": "not-a-date",            // malformed — treated as stale
        },
      }) as never)
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.coverageGaps).toContain("bad-skill");
    expect(body.coverageGaps).not.toContain("ok-skill");
  });

  it("accepts epoch-ms numeric timestamps as well as ISO strings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T00:00:00Z"));
    const tenDaysAgoEpoch = new Date("2026-04-13T00:00:00Z").getTime() - 10 * 86400 * 1000;
    mockReaddir.mockResolvedValue([makeDirEntry("num-skill", true)] as never);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify({
        skill_usage: { "num-skill": tenDaysAgoEpoch },
      }) as never)
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(enoent());
    const res = await GET();
    const body = await res.json();
    expect(body.coverageGaps).not.toContain("num-skill");
  });
});

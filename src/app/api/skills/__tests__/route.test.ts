// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return { ...actual, readFile: vi.fn(), readdir: vi.fn() };
});

vi.mock("@/lib/constants", () => ({
  SKILLS_PATH: "/tmp/test-skills",
  SKILL_CONTRIBUTIONS_LOG: "/tmp/test-skill-contributions.jsonl",
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

const FAKE_STATE = JSON.stringify({
  last_sync: "2026-04-11T04:00:15.000000",
  last_prune: "2026-04-06T05:00:08.000000",
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/skills", () => {
  it("returns HTTP 200", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
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
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const res = await GET();
    const body = await res.json();
    expect(body.totalSkills).toBe(2);
  });

  it("returns totalSkills=0 when skills directory is inaccessible", async () => {
    mockReaddir.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const res = await GET();
    const body = await res.json();
    expect(body.totalSkills).toBe(0);
  });

  it("returns all contribution zeros when JSONL file does not exist", async () => {
    mockReaddir.mockResolvedValue([]);
    // First readFile = state file, second = JSONL (throw ENOENT for JSONL)
    mockReadFile
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" })) // state file
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" })); // JSONL
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" })) // state
      .mockResolvedValueOnce("" as never); // empty JSONL
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" })) // state
      .mockResolvedValueOnce(makeJsonl(events) as never);
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
      .mockResolvedValueOnce(makeJsonl(events) as never);
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
      .mockResolvedValueOnce(makeJsonl(events) as never);
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
      .mockResolvedValueOnce(makeJsonl(events) as never);
    const res = await GET();
    const body = await res.json();
    expect(body.recentContributions).toHaveLength(1);
    expect(body.recentContributions[0].skill).toBe("recent-skill");
  });

  it("reads lastPruned from state file last_prune field", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile
      .mockResolvedValueOnce(FAKE_STATE as never)  // state file
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" })); // JSONL
    const res = await GET();
    const body = await res.json();
    expect(body.lastPruned).toBe("2026-04-06T05:00:08.000000");
  });

  it("returns lastPruned=null when state file is inaccessible", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
      .mockResolvedValueOnce(mixedLines as never);
    const res = await GET();
    const body = await res.json();
    expect(body.contributedByHermes).toBe(1);
    expect(body.contributedByGwen).toBe(1);
  });

  it("always includes a timestamp field in the response", async () => {
    mockReaddir.mockResolvedValue([]);
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const res = await GET();
    const body = await res.json();
    expect(body.timestamp).toBeDefined();
    expect(() => new Date(body.timestamp)).not.toThrow();
  });
});

describe("coverageGaps", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes skills never used", async () => {
    mockReaddir.mockResolvedValue([
      makeDirEntry("bash-scripting", true),
      makeDirEntry("python-async", true),
    ] as never);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify({ last_sync: "2026-04-11T04:00:15.000000", last_prune: "2026-04-06T05:00:08.000000", skill_usage: {} }) as never)
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))  // state file
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" })); // JSONL
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const res = await GET();
    const body = await res.json();
    expect(new Set(body.coverageGaps)).toEqual(new Set(["a", "b"]));
  });

  it("returns [] when SKILLS_PATH is inaccessible", async () => {
    mockReaddir.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    mockReadFile
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
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
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const res = await GET();
    const body = await res.json();
    expect(body.coverageGaps).not.toContain("num-skill");
  });
});

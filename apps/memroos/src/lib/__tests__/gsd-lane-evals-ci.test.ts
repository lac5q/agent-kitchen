// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `gsd-lane-evals-ci-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "lane-evals-ci.db");

async function loadDb() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  return import("@/lib/db");
}

describe("GSD lane eval CI gate", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadDb();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  });

  it("passes the committed gsd lane eval suite", async () => {
    const { getDb } = await loadDb();
    const { runGsdLaneEvalSuite } = await import("@/lib/gsd/lane-evals");
    const result = runGsdLaneEvalSuite(getDb(), { persistReceipts: false });
    expect(result.failedCases).toBe(0);
    expect(result.passRate).toBe(1);
  });
});

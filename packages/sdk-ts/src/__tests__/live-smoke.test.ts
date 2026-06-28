import { describe, expect, it } from "vitest";

import { MemroosClient } from "../client";
import sampleTrace from "../fixtures/sample-trace.json";

const runLiveSmoke = process.env.MEMROOS_SDK_SMOKE === "1";
const describeLive = runLiveSmoke ? describe : describe.skip;

describeLive("MemroosClient live smoke", () => {
  it("submits a sample trace to a running MemRoOS app", async () => {
    const baseUrl = process.env.MEMROOS_BASE_URL ?? "http://localhost:3000";
    const apiKey = process.env.MEMROOS_API_KEY;

    expect(apiKey, "MEMROOS_API_KEY is required when MEMROOS_SDK_SMOKE=1").toBeTruthy();

    const client = new MemroosClient({ baseUrl, apiKey: apiKey! });
    const result = await client.submitTrace(sampleTrace);

    expect(result.runId).toBeTruthy();
    expect(result.w).toBeTypeOf("number");
    expect(result.layers).toHaveProperty("l1");
    expect(result.layers).toHaveProperty("l2");
    expect(result.layers).toHaveProperty("l3");
  });
});

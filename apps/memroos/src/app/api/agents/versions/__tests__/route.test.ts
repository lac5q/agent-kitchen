// @vitest-environment node
import { describe, expect, it } from "vitest";

const versionsRoute = await import("../route");
const promoteRoute = await import("../promote/route");
const rollbackRoute = await import("../rollback/route");

describe("/api/agents/versions", () => {
  it("creates, promotes, and rolls back agent versions via REST endpoints", async () => {
    const agentId = `agent-${Date.now()}`;

    // 1. Create 1.0.0 draft
    const postReq = new Request("http://localhost/api/agents/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        version: "1.0.0",
        profile: "dev",
        modelRoute: { provider: "google", model: "gemini-1.5-pro" },
        systemInstructions: "You are the dev agent.",
      }),
    });
    const postRes = await versionsRoute.POST(postReq);
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.status).toBe("ok");

    // 2. Promote 1.0.0
    const promoteReq = new Request("http://localhost/api/agents/versions/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        version: "1.0.0",
        profile: "dev",
        operator: "luis",
      }),
    });
    const promoteRes = await promoteRoute.POST(promoteReq);
    expect(promoteRes.status).toBe(200);
    const promoteData = await promoteRes.json();
    expect(promoteData.status).toBe("ok");
    expect(promoteData.version.status).toBe("active");

    // 3. Create 1.1.0 draft
    const postReq2 = new Request("http://localhost/api/agents/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        version: "1.1.0",
        profile: "dev",
        modelRoute: { provider: "google", model: "gemini-2.0-flash" },
        systemInstructions: "You are dev agent v1.1.",
      }),
    });
    await versionsRoute.POST(postReq2);

    // 4. Promote 1.1.0
    const promoteReq2 = new Request("http://localhost/api/agents/versions/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        version: "1.1.0",
        profile: "dev",
        operator: "luis",
      }),
    });
    await promoteRoute.POST(promoteReq2);

    // 5. Rollback dev profile
    const rollbackReq = new Request("http://localhost/api/agents/versions/rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        profile: "dev",
        operator: "luis",
      }),
    });
    const rollbackRes = await rollbackRoute.POST(rollbackReq);
    expect(rollbackRes.status).toBe(200);
    const rollbackData = await rollbackRes.json();
    expect(rollbackData.status).toBe("ok");
    expect(rollbackData.version.version).toBe("1.0.0");
    expect(rollbackData.version.status).toBe("active");
  });
});

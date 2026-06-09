import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

describe("proxy", () => {
  it("does not hard-code private hosts for HTTPS redirects", async () => {
    const response = await proxy(
      new NextRequest("http://app.memroos.test/login", {
        headers: { host: "app.memroos.test" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects the production app host from HTTP to HTTPS", async () => {
    process.env.MEMROOS_HTTPS_APP_HOSTS = "app.memroos.test";
    const response = await proxy(
      new NextRequest("http://app.memroos.test/login", {
        headers: { host: "app.memroos.test" },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.memroos.test/login");
    delete process.env.MEMROOS_HTTPS_APP_HOSTS;
  });

  it("lets agent-authenticated API routes handle their own authorization", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3002/api/memory/add", {
        method: "POST",
        headers: { host: "localhost:3002", authorization: "Bearer agent-key" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("lets operator-key API routes handle their own authorization", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3002/api/agents/register", {
        method: "POST",
        headers: { host: "localhost:3002", "x-memroos-operator-key": "operator-key" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("lets SkillForge routes handle their own local/operator authorization", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3002/api/skillforge/status", {
        method: "GET",
        headers: { host: "localhost:3002", "x-memroos-operator-key": "operator-key" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("lets agent-memory continuity routes handle their own local/operator authorization", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3002/api/agent-memory/capture", {
        method: "POST",
        headers: { host: "localhost:3002", "x-memroos-operator-key": "operator-key" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("lets agent-context bus routes handle their own agent-key authorization", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3002/api/agent-context/messages", {
        method: "POST",
        headers: { host: "localhost:3002", authorization: "Bearer agent-key" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("lets ChatGPT Action routes handle their own API key authorization", async () => {
    const response = await proxy(
      new NextRequest("https://app.memroos.test/api/chatgpt/actions/search", {
        method: "POST",
        headers: { host: "app.memroos.test", "x-api-key": "action-key" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("serves research PDFs on the public marketing host", async () => {
    const response = await proxy(
      new NextRequest("https://memroos.com/research/memroos-governed-knowledge-architecture-paper.pdf", {
        headers: { host: "memroos.com" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("serves public screenshot assets on the marketing host", async () => {
    const response = await proxy(
      new NextRequest("https://memroos.com/screenshots/memroos-floor.png", {
        headers: { host: "memroos.com" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("serves extracted landing assets on the marketing host", async () => {
    const response = await proxy(
      new NextRequest("https://memroos.com/landing/assets/shots/operator-floor.png", {
        headers: { host: "memroos.com" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("serves the SVG app icon on the marketing host", async () => {
    const response = await proxy(
      new NextRequest("https://memroos.com/icon.svg", {
        headers: { host: "memroos.com" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("treats the Epilogue Capital MemRoOS alias as an app host", async () => {
    const loginResponse = await proxy(
      new NextRequest("https://memroos.epiloguecapital.com/login", {
        headers: { host: "memroos.epiloguecapital.com" },
      })
    );

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers.get("location")).toBeNull();

    const appResponse = await proxy(
      new NextRequest("https://memroos.epiloguecapital.com/dispatch", {
        headers: { host: "memroos.epiloguecapital.com" },
      })
    );

    expect(appResponse.status).toBe(307);
    expect(appResponse.headers.get("location")).toBe("https://memroos.epiloguecapital.com/login");
  });

  it("serves the public landing on memroos.localhost for local preview", async () => {
    const response = await proxy(
      new NextRequest("http://memroos.localhost:3003/", {
        headers: { host: "memroos.localhost:3003" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://memroos.localhost:3003/landing/index.html"
    );
  });

  it("allows analytics and Google Fonts endpoints in the content security policy", async () => {
    const response = await proxy(
      new NextRequest("https://memroos.com/", {
        headers: { host: "memroos.com" },
      })
    );

    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toContain("https://www.googletagmanager.com");
    expect(csp).toContain("https://www.google-analytics.com");
    expect(csp).toContain("https://region1.google-analytics.com");
    expect(csp).toContain("https://fonts.googleapis.com");
    expect(csp).toContain("https://fonts.gstatic.com");
  });
});

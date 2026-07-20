// @vitest-environment node
import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `onboarding-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes.db");

async function loadRoutes() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  process.env.MEMROOS_OPERATOR_API_KEY = "operator-secret";
  process.env.MEMROOS_ONBOARDING_SECRET = "onboarding-secret";
  vi.resetModules();
  const inviteRoute = await import("../invite/route");
  const registerRoute = await import("../register/route");
  const scriptRoute = await import("../script/route");
  const agentsRoute = await import("../../agents/route");
  const dbModule = await import("@/lib/db");
  return { inviteRoute, registerRoute, scriptRoute, agentsRoute, closeDb: dbModule.closeDb };
}

describe("agent onboarding routes", { tags: ["slow"] }, () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoutes();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    delete process.env.MEMROOS_OPERATOR_API_KEY;
    delete process.env.MEMROOS_ONBOARDING_SECRET;
  });

  it("rejects invite minting without operator authorization", async () => {
    const { inviteRoute } = await loadRoutes();

    const response = await inviteRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: "maria",
          name: "Maria",
          role: "Research partner",
          platform: "openclaw",
          ttlMinutes: 5,
        }),
      })
    );

    expect(response.status).toBe(403);
  });

  it("issues a runnable generic invite command when no agent identity is scoped", async () => {
    const { inviteRoute } = await loadRoutes();

    const response = await inviteRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({ platform: "openclaw", ttlMinutes: 60 }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.command).toContain("--platform 'openclaw'");
    expect(body.command).toContain("--mcp-target 'auto'");
    expect(body.command).not.toContain("<agent-id>");
    expect(body.command).not.toContain("--id ");
    expect(body.command).not.toContain("--name ");
    expect(body.command).not.toContain("--role ");
  });

  it("uses forwarded public origin when minting invites behind a proxy", async () => {
    const { inviteRoute } = await loadRoutes();

    const response = await inviteRoute.POST(
      new Request("https://localhost:3002/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-host": "memroos.public.example",
          "x-forwarded-proto": "https",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({ platform: "hermes", ttlMinutes: 60 }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.command).toContain("https://memroos.public.example/api/onboarding/script?token=");
    expect(body.mcpUrl).toBe("https://memroos.public.example/mcp");
  });

  it("registers an agent from an onboarding token and returns MCP config without storing the raw key in registry output", async () => {
    const { inviteRoute, registerRoute, agentsRoute } = await loadRoutes();

    const inviteResponse = await inviteRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({
          agentId: "chatgpt",
          name: "ChatGPT",
          role: "Interactive planning and research agent",
          platform: "chatgpt",
          protocol: "rest",
        }),
      })
    );
    const invite = await inviteResponse.json();

    const registerResponse = await registerRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: invite.token,
          id: "chatgpt",
          name: "ChatGPT",
          role: "Interactive planning and research agent",
          platform: "chatgpt",
        }),
      })
    );

    expect(registerResponse.status).toBe(200);
    const registered = await registerResponse.json();
    expect(registered.apiKey).toMatch(/^ak_chatgpt_/);
    expect(registered.mcp).toEqual({
      mcpServers: {
        memroos: {
          url: "https://memroos.example.test/mcp",
        },
      },
    });

    const listResponse = await agentsRoute.GET();
    const agents = (await listResponse.json()).agents;
    expect(agents).toEqual([
      expect.objectContaining({
        id: "chatgpt",
        platform: "chatgpt",
        metadata: expect.objectContaining({ onboardedVia: "memroos" }),
      }),
    ]);
    expect(JSON.stringify(agents)).not.toContain(registered.apiKey);
  });

  it("rejects using a scoped invite for a different agent id", async () => {
    const { inviteRoute, registerRoute } = await loadRoutes();

    const inviteResponse = await inviteRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({ agentId: "sophia", platform: "codex" }),
      })
    );
    const invite = await inviteResponse.json();

    const registerResponse = await registerRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: invite.token,
          id: "maria",
          name: "Maria",
          role: "Research partner",
          platform: "openclaw",
        }),
      })
    );

    expect(registerResponse.status).toBe(403);
    expect(await registerResponse.json()).toMatchObject({
      ok: false,
      error: "Onboarding token is not valid for this agent id",
    });
  });

  it("serves a bootstrap script for valid tokens only", async () => {
    const { inviteRoute, scriptRoute } = await loadRoutes();
    const inviteResponse = await inviteRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({ agentId: "maria", platform: "openclaw" }),
      })
    );
    const invite = await inviteResponse.json();

    const scriptResponse = await scriptRoute.GET(
      new Request(`https://memroos.example.test/api/onboarding/script?token=${encodeURIComponent(invite.token)}`)
    );
    expect(scriptResponse.status).toBe(200);
    const script = await scriptResponse.text();
    expect(script).toContain("MEMROOS_URL=\"https://memroos.example.test\"");
    expect(script).toContain("curl -fsSL \"${MEMROOS_URL}/api/onboarding/register\"");
    expect(script).toContain("MCP_TARGET=\"${MEMROOS_MCP_TARGET:-auto}\"");
    expect(script).not.toContain("\\${");
    expect(script).toContain("MEMROOS_AGENT_ID");
    expect(script).toContain("MEMROOS_AGENT_NAME");
    expect(script).toContain("\"claude\": \"claude\"");
    expect(script).toContain("\"cline\": \"cline\"");
    expect(script).toContain("\"gemini\": \"gemini\"");
    expect(script).toContain("\"qwen\": \"qwen\"");
    expect(script).toContain("\"zcode\": \"zcode\"");
    expect(script).toContain("\"pi\": \"stdout\"");
    expect(script).toContain("\"chatgpt\": \"stdout\"");
    expect(script).toContain("\"grok\": \"stdout\"");
    expect(script).toContain("\"droid\": \"droid\"");
    expect(script).toContain("\"openclaw\": \"openclaw\"");
    expect(script).toContain("\"opencode\": \"opencode\"");
    expect(script).toContain("\"hermes\": \"hermes\"");
    expect(script).toContain("\"cursor\": \"cursor\"");
    expect(script).toContain("home / \".config\" / \"opencode\" / \"opencode.json\"");
    expect(script).toContain('if sys.platform == "darwin":');
    expect(script).toContain('elif os.name == "nt":');
    expect(script).toContain('home / ".config" / "Code" / "User" / "globalStorage" / "saoudrizwan.claude-dev" / "settings"');
    expect(script).toContain('home / "Library" / "Application Support" / "Code" / "User" / "globalStorage" / "saoudrizwan.claude-dev" / "settings"');
    expect(script).toContain("home / \".zcode\" / \"cli\" / \"config.json\"");
    expect(script).toContain("pathlib.Path.cwd() / \".cursor\" / \"mcp.json\"");
    expect(script).toContain("\"type\": \"remote\"");
    expect(script).toContain("codex\", [\"mcp\", \"add\", \"memroos\", \"--url\"");
    expect(script).toContain("home / \".codex\" / \"config.toml\"");
    expect(script).not.toContain("home / \".codex\" / \"mcp.json\"");
    expect(script).toContain("claude\", [\"mcp\", \"add\"");
    expect(script).toContain("gemini\", [\"mcp\", \"add\"");
    expect(script).toContain("qwen\", [\"mcp\", \"add\"");
    expect(script).toContain("hermes\", [\"mcp\", \"add\", \"memroos\", \"--url\"");

    const rejected = await scriptRoute.GET(
      new Request("https://memroos.example.test/api/onboarding/script?token=bad")
    );
    expect(rejected.status).toBe(403);
  });

  it("writes Cline MCP configuration at the Linux and macOS VS Code paths without replacing other servers", async () => {
    const { inviteRoute, scriptRoute } = await loadRoutes();
    const inviteResponse = await inviteRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({ agentId: "cline-agent", platform: "cline" }),
      })
    );
    const invite = await inviteResponse.json();
    const scriptResponse = await scriptRoute.GET(
      new Request(`https://memroos.example.test/api/onboarding/script?token=${encodeURIComponent(invite.token)}`)
    );
    const script = await scriptResponse.text();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cline-onboarding-"));

    try {
      const scriptPath = path.join(tempRoot, "onboard");
      const binDir = path.join(tempRoot, "bin");
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(scriptPath, script, { mode: 0o700 });
      fs.writeFileSync(
        path.join(binDir, "curl"),
        `#!/usr/bin/env bash
printf '%s\\n' '{"ok":true,"env":{"MEMROOS_URL":"https://memroos.example.test","MEMROOS_AGENT_ID":"cline-agent"},"apiKey":"ak_cline_test","mcp":{"mcpServers":{"memroos":{"url":"https://memroos.example.test/mcp"}}}}'
`,
        { mode: 0o700 }
      );

      for (const [platform, settingsPath] of [
        ["linux", [".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"]],
        ["darwin", ["Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"]],
      ] as const) {
        const home = path.join(tempRoot, platform);
        const configPath = path.join(home, ...settingsPath);
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify({ preserved: true, mcpServers: { existing: { url: "https://existing.example.test/mcp" } } }));

        const env: NodeJS.ProcessEnv = {
          ...process.env,
          HOME: home,
          PATH: `${binDir}:${process.env.PATH}`,
        };
        if (platform === "darwin") {
          const siteDir = path.join(tempRoot, "sitecustomize");
          fs.mkdirSync(siteDir, { recursive: true });
          fs.writeFileSync(path.join(siteDir, "sitecustomize.py"), 'import sys\nsys.platform = "darwin"\n');
          env.PYTHONPATH = siteDir;
        }

        execFileSync("bash", [scriptPath, "--id", "cline-agent", "--name", "Cline Agent", "--platform", "cline"], {
          env,
          stdio: "pipe",
        });
        expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
          preserved: true,
          mcpServers: {
            existing: { url: "https://existing.example.test/mcp" },
            memroos: { url: "https://memroos.example.test/mcp" },
          },
        });
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it.each(["cursor", "cline", "hermes", "openclaw", "opencode", "zcode", "claude", "gemini", "qwen", "codex", "pi", "droid"] as const)(
    "onboards %s agents with the shared bootstrap contract",
    async (platform) => {
      const { inviteRoute, registerRoute, agentsRoute } = await loadRoutes();
      const agentId = `${platform}-agent`;

      const inviteResponse = await inviteRoute.POST(
        new Request("https://memroos.example.test/api/onboarding/invite", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-memroos-operator-key": "operator-secret",
          },
          body: JSON.stringify({
            agentId,
            name: `${platform} Agent`,
            role: "Memroos worker",
            platform,
          }),
        })
      );
      const invite = await inviteResponse.json();
      expect(invite.command).toContain(`--platform '${platform}'`);

      const registerResponse = await registerRoute.POST(
        new Request("https://memroos.example.test/api/onboarding/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: invite.token,
            id: agentId,
            name: `${platform} Agent`,
            role: "Memroos worker",
            platform,
          }),
        })
      );

      expect(registerResponse.status).toBe(200);
      expect(await registerResponse.json()).toMatchObject({
        ok: true,
        agent: expect.objectContaining({ id: agentId, platform }),
      });

      const agents = (await (await agentsRoute.GET()).json()).agents;
      expect(agents).toContainEqual(expect.objectContaining({ id: agentId, platform }));
    }
  );
});

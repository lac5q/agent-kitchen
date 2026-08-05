// @vitest-environment node
import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `onboarding-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes.db");
const INITIAL_NODE_ENV = process.env.NODE_ENV;

async function loadRoutes() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  process.env.MEMROOS_OPERATOR_API_KEY = "operator-secret";
  process.env.MEMROOS_ONBOARDING_SECRET = "onboarding-secret";
  process.env.MEMROOS_JWT_SECRET = "test-secret-that-is-long-enough-32ch";
  vi.resetModules();
  const inviteRoute = await import("../invite/route");
  const authInviteRoute = await import("@/app/api/auth/invite/route");
  const registerRoute = await import("../register/route");
  const scriptRoute = await import("../script/route");
  const bootstrapRoute = await import("../bootstrap/route");
  const agentsRoute = await import("../../agents/route");
  const dbModule = await import("@/lib/db");

  // Listing agents is scoped to a viewer, so the suite needs a real signed-in
  // admin rather than an anonymous call.
  const { signAccessToken } = await import("@/lib/auth/jwt");
  const db = dbModule.getDb();
  db.prepare(
    "INSERT OR IGNORE INTO users (id, email, display_name, password_hash) VALUES (?,?,?,?)"
  ).run("test-admin", "admin@memroos.test", "Test Admin", "x");
  db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?,?)").run(
    "test-admin",
    "admin"
  );
  const adminToken = await signAccessToken("test-admin", "admin");
  const listAgents = () =>
    agentsRoute.GET(
      new Request("https://memroos.example.test/api/agents", {
        headers: { authorization: `Bearer ${adminToken}` },
      }) as never
    );
  return {
    listAgents,
    inviteRoute,
    authInviteRoute,
    registerRoute,
    scriptRoute,
    bootstrapRoute,
    agentsRoute,
    getDb: dbModule.getDb,
    closeDb: dbModule.closeDb,
  };
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
    delete process.env.MEMROOS_JWT_SECRET;
    delete process.env.MEMROOS_PUBLIC_BASE_URL;
    if (INITIAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = INITIAL_NODE_ENV;
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
        body: JSON.stringify({ platform: "openclaw", ttlMinutes: 60, ownerUserId: "test-admin" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.command).toContain("--platform 'openclaw'");
    expect(body.command).toContain("--mcp-target 'auto'");
    expect(body.agentId).toMatch(/^onboarding-/);
    expect(body.command).toContain("--id ");
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
        body: JSON.stringify({ platform: "hermes", ttlMinutes: 60, ownerUserId: "test-admin" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.command).toContain("https://memroos.public.example/api/onboarding/script?token=");
    expect(body.mcpUrl).toBe("https://memroos.public.example/mcp");
  });

  it("does not audit an onboarding invite that uses a configured public URL", async () => {
    process.env.NODE_ENV = "production";
    process.env.MEMROOS_PUBLIC_BASE_URL = "https://memroos.example.test";
    const { inviteRoute, getDb } = await loadRoutes();

    const response = await inviteRoute.POST(
      new Request("https://localhost:3002/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-host": "memroos.public.example",
          "x-forwarded-proto": "https",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({ platform: "hermes", ownerUserId: "test-admin" }),
      })
    );

    expect(response.status).toBe(200);
    expect((getDb().prepare("SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = ?").get(
      "onboarding.base_url_fallback"
    ) as { count: number }).count).toBe(0);
  });

  it("audits an onboarding invite that uses the forwarded-host fallback", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.MEMROOS_PUBLIC_BASE_URL;
    const { inviteRoute, getDb } = await loadRoutes();

    const response = await inviteRoute.POST(
      new Request("https://localhost:3002/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-host": "memroos.public.example",
          "x-forwarded-proto": "https",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({ platform: "hermes", ownerUserId: "test-admin" }),
      })
    );

    expect(response.status).toBe(200);
    expect((getDb().prepare("SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = ?").get(
      "onboarding.base_url_fallback"
    ) as { count: number }).count).toBe(1);
  });

  it("does not audit an onboarding invite that uses a caller-supplied URL", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.MEMROOS_PUBLIC_BASE_URL;
    const { inviteRoute, getDb } = await loadRoutes();

    const response = await inviteRoute.POST(
      new Request("https://localhost:3002/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-host": "memroos.public.example",
          "x-forwarded-proto": "https",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({
          platform: "hermes",
          memroosUrl: "https://caller.example.test",
          ownerUserId: "test-admin",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect((getDb().prepare("SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = ?").get(
      "onboarding.base_url_fallback"
    ) as { count: number }).count).toBe(0);
  });

  it("does not audit an auth invite that uses a configured public URL", async () => {
    process.env.NODE_ENV = "production";
    process.env.MEMROOS_PUBLIC_BASE_URL = "https://memroos.example.test";
    const { authInviteRoute, getDb } = await loadRoutes();
    const { signAccessToken } = await import("@/lib/auth/jwt");
    const adminToken = await signAccessToken("test-admin", "admin");

    const response = await authInviteRoute.POST(
      new Request("https://localhost:3002/api/auth/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
          "x-forwarded-host": "memroos.public.example",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({ role: "operator" }),
      })
    );

    expect(response.status).toBe(201);
    expect((getDb().prepare("SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = ?").get(
      "onboarding.base_url_fallback"
    ) as { count: number }).count).toBe(0);
  });

  it("audits an auth invite that uses the forwarded-host fallback", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.MEMROOS_PUBLIC_BASE_URL;
    const { authInviteRoute, getDb } = await loadRoutes();
    const { signAccessToken } = await import("@/lib/auth/jwt");
    const adminToken = await signAccessToken("test-admin", "admin");

    const response = await authInviteRoute.POST(
      new Request("https://localhost:3002/api/auth/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
          "x-forwarded-host": "memroos.public.example",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({ role: "operator" }),
      })
    );

    expect(response.status).toBe(201);
    expect((getDb().prepare("SELECT COUNT(*) AS count FROM audit_entries WHERE event_type = ?").get(
      "onboarding.base_url_fallback"
    ) as { count: number }).count).toBe(1);
  });

  it("registers an agent from an onboarding token and returns MCP config without storing the raw key in registry output", async () => {
    const { inviteRoute, registerRoute, agentsRoute, listAgents } = await loadRoutes();

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
          ownerUserId: "test-admin",
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

    const listResponse = await listAgents();
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
        body: JSON.stringify({ agentId: "sophia", platform: "codex", ownerUserId: "test-admin" }),
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
        body: JSON.stringify({ agentId: "maria", platform: "openclaw", ownerUserId: "test-admin" }),
      })
    );
    const invite = await inviteResponse.json();

    const scriptResponse = await scriptRoute.GET(
      new Request(`https://memroos.example.test/api/onboarding/script?token=${encodeURIComponent(invite.token)}`)
    );
    expect(scriptResponse.status).toBe(200);
    const script = await scriptResponse.text();
    expect(script).toContain("TOKEN='");
    expect(script).toContain("TOKEN_KID='");
    expect(script).toContain("MEMROOS_URL='https://memroos.example.test'");
    expect(script).toContain("curl -fsSL \"${MEMROOS_URL}/api/onboarding/register\"");
    expect(script).toContain("report_onboarding_failure");
    expect(script).toContain("%{http_code}");
    expect(script).toContain("X-Memroos-Reporter: onboarding-script");
    expect(script).toContain('"tokenKid": token_kid');
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
        body: JSON.stringify({ agentId: "cline-agent", platform: "cline", ownerUserId: "test-admin" }),
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
        // Mimic real curl -w '\n%{http_code}': body, then a newline, then the
        // status. The register parser reads the status from the last line.
        `#!/usr/bin/env bash
printf '%s\\n200' '{"ok":true,"env":{"MEMROOS_URL":"https://memroos.example.test","MEMROOS_AGENT_ID":"cline-agent"},"apiKey":"ak_cline_test","mcp":{"mcpServers":{"memroos":{"url":"https://memroos.example.test/mcp"}}}}'
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
        // Force Python's sys.platform so Linux/macOS path branches are exercised
        // regardless of the host OS running the test suite.
        const siteDir = path.join(tempRoot, `sitecustomize-${platform}`);
        fs.mkdirSync(siteDir, { recursive: true });
        fs.writeFileSync(path.join(siteDir, "sitecustomize.py"), `import sys\nsys.platform = "${platform}"\n`);
        env.PYTHONPATH = siteDir;

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

  it.each(["claude", "codex"] as const)(
    "runs the per-user MCP sign-in during %s bootstrap",
    async (binary) => {
      const { inviteRoute, scriptRoute } = await loadRoutes();
      const agentId = `${binary}-login-agent`;
      const inviteResponse = await inviteRoute.POST(
        new Request("https://memroos.example.test/api/onboarding/invite", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-memroos-operator-key": "operator-secret",
          },
          body: JSON.stringify({ agentId, platform: binary, ownerUserId: "test-admin" }),
        })
      );
      const invite = await inviteResponse.json();
      const scriptResponse = await scriptRoute.GET(
        new Request(`https://memroos.example.test/api/onboarding/script?token=${encodeURIComponent(invite.token)}`)
      );
      const script = await scriptResponse.text();
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${binary}-login-onboarding-`));

      try {
        const scriptPath = path.join(tempRoot, "onboard");
        const binDir = path.join(tempRoot, "bin");
        const home = path.join(tempRoot, "home");
        const callsFile = path.join(tempRoot, "calls.log");
        fs.mkdirSync(binDir, { recursive: true });
        fs.mkdirSync(home, { recursive: true });
        fs.writeFileSync(scriptPath, script, { mode: 0o700 });
        fs.writeFileSync(
          path.join(binDir, "curl"),
          // Mimic real curl -w '\n%{http_code}': body, newline, then status.
          `#!/usr/bin/env bash
printf '%s\\n200' '{"ok":true,"env":{"MEMROOS_URL":"https://memroos.example.test","MEMROOS_AGENT_ID":"${agentId}"},"apiKey":"ak_${binary}_login_test","mcp":{"mcpServers":{"memroos":{"url":"https://memroos.example.test/mcp"}}}}'
`,
          { mode: 0o700 }
        );
        // Stub the client CLI: record every invocation, succeed at everything.
        fs.writeFileSync(
          path.join(binDir, binary),
          `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${callsFile}"
exit 0
`,
          { mode: 0o700 }
        );

        const stdout = execFileSync(
          "bash",
          [scriptPath, "--id", agentId, "--name", `${binary} Login Agent`, "--platform", binary],
          { env: { ...process.env, HOME: home, PATH: `${binDir}:${process.env.PATH}` }, stdio: "pipe" }
        ).toString();

        const calls = fs.readFileSync(callsFile, "utf8").trim().split("\n");
        const addIndex = calls.findIndex((line) => line.includes("mcp add") && line.includes("memroos"));
        const loginIndex = calls.findIndex((line) => line === "mcp login memroos");
        // The standard: registration first, then the sign-in is STARTED for the
        // invitee — never left as an unstated later step.
        expect(addIndex).toBeGreaterThanOrEqual(0);
        expect(loginIndex).toBeGreaterThan(addIndex);
        expect(stdout).toContain("== MemroOS setup ==");
        expect(stdout).toContain("you are DONE");
        expect(stdout).toContain(`${binary} mcp login memroos`);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  );

  it.each(["cursor", "cline", "hermes", "openclaw", "opencode", "zcode", "claude", "gemini", "qwen", "codex", "pi", "droid"] as const)(
    "onboards %s agents with the shared bootstrap contract",
    async (platform) => {
      const { inviteRoute, registerRoute, agentsRoute, listAgents } = await loadRoutes();
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
            ownerUserId: "test-admin",
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

      const agents = (await (await listAgents()).json()).agents;
      expect(agents).toContainEqual(expect.objectContaining({ id: agentId, platform }));
    }
  );

  it("rejects bootstrap without authentication", async () => {
    const { bootstrapRoute } = await loadRoutes();
    const response = await bootstrapRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platforms: ["claude"] }),
      })
    );
    expect(response.status).toBe(401);
  });

  it("lets a reviewer mint multi-platform bootstrap commands with public URL and owner_id", async () => {
    const { bootstrapRoute, registerRoute, getDb } = await loadRoutes();
    const { signAccessToken } = await import("@/lib/auth/jwt");

    const userId = "revieweruser001";
    const db = getDb();
    db.prepare(
      "INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, "eric@example.com", "Eric", "hash", new Date().toISOString());
    db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(userId, "reviewer");

    process.env.MEMROOS_PUBLIC_BASE_URL = "http://localhost:3000";
    const token = await signAccessToken(userId, "reviewer");
    const response = await bootstrapRoute.POST(
      new Request("https://127.0.0.1:3000/api/onboarding/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "x-forwarded-host": "memroos-cordant.epiloguecapital.com",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({ platforms: ["claude", "cursor"] }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.commands).toHaveLength(2);
    expect(body.commands[0].label).toBe("Claude Code");
    expect(body.commands[0].command).toContain(
      "https://memroos-cordant.epiloguecapital.com/api/onboarding/script?token="
    );
    expect(body.commands[0].command).toContain("--platform 'claude'");
    expect(body.commands[0].command).toContain("--mcp-target 'auto'");
    expect(body.commands[0].agentId).toBe(`${userId.slice(0, 8)}-claude`);

    const tokenMatch = body.commands[0].command.match(/token=([^']+)'/);
    expect(tokenMatch).toBeTruthy();
    const onboardingToken = decodeURIComponent(tokenMatch![1]);

    const registerResponse = await registerRoute.POST(
      new Request("https://memroos-cordant.epiloguecapital.com/api/onboarding/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: onboardingToken,
          id: `${userId.slice(0, 8)}-claude`,
          name: "Eric Claude",
          role: "Cordant worker",
          platform: "claude",
          ownerId: "attacker-should-be-ignored",
        }),
      })
    );
    expect(registerResponse.status).toBe(200);

    const owned = db
      .prepare("SELECT owner_id FROM registered_agents WHERE id = ?")
      .get(`${userId.slice(0, 8)}-claude`) as { owner_id: string | null };
    expect(owned.owner_id).toBe(userId);
  });

  it("rejects unknown bootstrap platforms", async () => {
    const { bootstrapRoute, getDb } = await loadRoutes();
    const { signAccessToken } = await import("@/lib/auth/jwt");
    const userId = "revieweruser002";
    const db = getDb();
    db.prepare(
      "INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, "eric2@example.com", "Eric2", "hash", new Date().toISOString());
    db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(userId, "reviewer");
    const token = await signAccessToken(userId, "reviewer");

    const response = await bootstrapRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ platforms: ["not-a-platform"] }),
      })
    );
    expect(response.status).toBe(400);
  });

  it("rejects replaying the same onboarding token", async () => {
    const { inviteRoute, registerRoute } = await loadRoutes();
    const inviteResponse = await inviteRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({ agentId: "replay-agent", platform: "codex", ownerUserId: "test-admin" }),
      })
    );
    const invite = await inviteResponse.json();
    const registration = {
      token: invite.token,
      id: "replay-agent",
      name: "Replay Agent",
      role: "Replay attack target",
      platform: "codex",
    };

    expect(
      (await registerRoute.POST(new Request("https://memroos.example.test/api/onboarding/register", {
        method: "POST",
        body: JSON.stringify(registration),
      }))).status
    ).toBe(200);

    const replay = await registerRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/register", {
        method: "POST",
        body: JSON.stringify(registration),
      })
    );
    expect(replay.status).toBe(403);
    expect(await replay.json()).toMatchObject({
      ok: false,
      error: "onboarding_token_replayed",
      code: "onboarding_token_replayed",
    });
  });

  it("clamps an attacker-supplied year-long TTL and reports the effective hour", async () => {
    const { inviteRoute } = await loadRoutes();
    const response = await inviteRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({
          agentId: "ttl-attack-agent",
          platform: "codex",
          ttlMinutes: 525600,
          ownerUserId: "test-admin",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ttlMinutes).toBe(60);
    expect(new Date(body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000 + 5000);
  });

  it.each([
    ["empty", []],
    ["missing", undefined],
  ] as const)("rejects a %s allowedAgentIds scope", async (_label, allowedAgentIds) => {
    const { registerRoute } = await loadRoutes();
    const { createAgentOnboardingToken } = await import("@/lib/agent/onboarding");
    const { token } = createAgentOnboardingToken({
      memroosUrl: "https://memroos.example.test",
      ownerUserId: "test-admin",
      ...(allowedAgentIds === undefined ? {} : { allowedAgentIds }),
    });

    const response = await registerRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/register", {
        method: "POST",
        body: JSON.stringify({
          token,
          id: "unscoped-attack-agent",
          name: "Unscoped Attack Agent",
          role: "Scope bypass attempt",
          platform: "codex",
        }),
      })
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: "Invalid onboarding token scope" });
  });

  it("rejects tampered and expired onboarding tokens", async () => {
    const { inviteRoute, registerRoute } = await loadRoutes();
    const inviteResponse = await inviteRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({ agentId: "tamper-agent", platform: "codex", ownerUserId: "test-admin" }),
      })
    );
    const invite = await inviteResponse.json();
    const tamperedToken = `${invite.token.slice(0, -1)}${invite.token.endsWith("A") ? "B" : "A"}`;
    const tampered = await registerRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/register", {
        method: "POST",
        body: JSON.stringify({
          token: tamperedToken,
          id: "tamper-agent",
          name: "Tampered Agent",
          role: "Signature attack",
          platform: "codex",
        }),
      })
    );
    expect(tampered.status).toBe(403);
    expect((await tampered.json()).error).toBe("Invalid onboarding token signature");

    const { createAgentOnboardingToken } = await import("@/lib/agent/onboarding");
    const { token: expiredToken } = createAgentOnboardingToken({
      memroosUrl: "https://memroos.example.test",
      ownerUserId: "test-admin",
      allowedAgentIds: ["expired-agent"],
      ttlSeconds: -1,
    });
    const expired = await registerRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/register", {
        method: "POST",
        body: JSON.stringify({
          token: expiredToken,
          id: "expired-agent",
          name: "Expired Agent",
          role: "Expiry attack",
          platform: "codex",
        }),
      })
    );
    expect(expired.status).toBe(403);
    expect((await expired.json()).error).toBe("Onboarding token expired");
  });

  it("rejects caller capabilities and stores only the signed token capabilities", async () => {
    const { inviteRoute, registerRoute, getDb } = await loadRoutes();
    const inviteResponse = await inviteRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({
          agentId: "capability-source-agent",
          platform: "codex",
          ownerUserId: "test-admin",
          capabilities: [{ id: "signed-cap", name: "Signed Capability", description: "", tags: [] }],
        }),
      })
    );
    const invite = await inviteResponse.json();
    const baseRegistration = {
      token: invite.token,
      id: "capability-source-agent",
      name: "Capability Source Agent",
      role: "Capability source attack target",
      platform: "codex",
    };

    const rejected = await registerRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/register", {
        method: "POST",
        body: JSON.stringify({ ...baseRegistration, capabilities: [{ id: "attacker-cap" }] }),
      })
    );
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toContain("capabilities");

    const accepted = await registerRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/register", {
        method: "POST",
        body: JSON.stringify(baseRegistration),
      })
    );
    expect(accepted.status).toBe(200);
    const row = getDb()
      .prepare("SELECT capability_id FROM agent_capabilities WHERE agent_id = ?")
      .get("capability-source-agent") as { capability_id: string };
    expect(row.capability_id).toBe("signed-cap");
  });

  it("rejects onboarding a revoked id without minting a new key or clearing revocation", async () => {
    const { inviteRoute, registerRoute, getDb } = await loadRoutes();
    const db = getDb();
    const revokedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO registered_agents (id, name, role, platform, protocol, owner_id, deregistered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("revoked-onboarding-agent", "Revoked Agent", "Revocation target", "codex", "rest", "test-admin", revokedAt);

    const inviteResponse = await inviteRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({ agentId: "revoked-onboarding-agent", platform: "codex", ownerUserId: "test-admin" }),
      })
    );
    const invite = await inviteResponse.json();
    const response = await registerRoute.POST(
      new Request("https://memroos.example.test/api/onboarding/register", {
        method: "POST",
        body: JSON.stringify({
          token: invite.token,
          id: "revoked-onboarding-agent",
          name: "Revoked Agent Re-onboard Attempt",
          role: "Revocation bypass attempt",
          platform: "codex",
        }),
      })
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "agent_revoked", code: "agent_revoked" });
    expect((db.prepare("SELECT deregistered_at FROM registered_agents WHERE id = ?").get("revoked-onboarding-agent") as { deregistered_at: string }).deregistered_at).toBe(revokedAt);
    expect(db.prepare("SELECT COUNT(*) AS count FROM agent_api_keys WHERE agent_id = ?").get("revoked-onboarding-agent")).toEqual({ count: 0 });
  });
});

import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3002";

test.describe("Voice & Chat panel — Flow page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/flow`);
    // Wait for the page to finish loading
    await page.waitForLoadState("networkidle");
  });

  test("Voice & Chat panel is visible with agent selector", async ({ page }) => {
    // Header should say "Voice & Chat"
    await expect(page.getByText("Voice & Chat")).toBeVisible();
    // Agent dropdown exists with default "Kitchen Floor"
    const select = page.locator("select").filter({ hasText: "Kitchen Floor" });
    await expect(select).toBeVisible();
  });

  test("Chat tab is active by default and shows placeholder", async ({ page }) => {
    // Chat tab should be active
    const chatTab = page.getByRole("button", { name: "chat" });
    await expect(chatTab).toBeVisible();
    // Textarea placeholder visible
    await expect(
      page.getByPlaceholder(/Message Kitchen Floor/)
    ).toBeVisible();
  });

  test("Can switch between agents", async ({ page }) => {
    const select = page.locator("select");
    await select.selectOption("flow");
    await expect(
      page.getByPlaceholder(/Message Flow/)
    ).toBeVisible();
    await select.selectOption("general");
    await expect(
      page.getByPlaceholder(/Message General/)
    ).toBeVisible();
  });

  test("Chat tab: send a message and receive a streaming response", async ({ page }) => {
    // Ensure ANTHROPIC_API_KEY is set — skip gracefully if not
    const input = page.getByPlaceholder(/Message Kitchen Floor/);
    await input.fill("What is Agent Kitchen in one sentence?");
    await page.getByRole("button", { name: "Send" }).click();

    // User bubble appears immediately
    await expect(page.getByText("What is Agent Kitchen in one sentence?")).toBeVisible();

    // Assistant bubble appears (streaming — wait up to 15s)
    await expect(
      page.locator(".text-xs.rounded-lg").filter({ hasText: "Kitchen Floor" }).last()
    ).toBeVisible({ timeout: 15000 });
  });

  test("Voice tab is accessible and shows Pipecat server status", async ({ page }) => {
    await page.getByRole("button", { name: "voice" }).click();
    // Should show "Pipecat:" label
    await expect(page.getByText(/Pipecat:/)).toBeVisible();
    // Should show connect button (since Pipecat server is running)
    await expect(
      page.getByRole("button", { name: /Connect to/ })
    ).toBeVisible({ timeout: 3000 });
  });

  test("Panel can be collapsed and expanded", async ({ page }) => {
    // Collapse
    await page.getByLabel("Collapse").click();
    // Chat tab should be hidden
    await expect(page.getByRole("button", { name: "chat" })).not.toBeVisible();
    // Expand
    await page.getByLabel("Expand").click();
    await expect(page.getByRole("button", { name: "chat" })).toBeVisible();
  });
});

test.describe("Chat API — /api/chat", () => {
  test("returns 400 when message is missing", async ({ request }) => {
    const res = await request.post(`${BASE}/api/chat`, {
      data: { agentId: "kitchen" },
    });
    expect(res.status()).toBe(400);
  });

  test("streams SSE for a valid message", async ({ request }) => {
    const res = await request.post(`${BASE}/api/chat`, {
      data: { message: "Say hi", agentId: "general" },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/event-stream");
    const body = await res.text();
    // Should contain at least one data: line
    expect(body).toContain("data:");
  });
});

test.describe("Ledger analytics panels", () => {
  test("Ledger page shows Analytics section with time toggle", async ({ page }) => {
    await page.goto(`${BASE}/ledger`);
    await page.waitForLoadState("networkidle");
    // Window toggle buttons
    await expect(page.getByRole("button", { name: "day" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "week" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "month" }).first()).toBeVisible();
  });
});

test.describe("Library analytics panels", () => {
  test("Library page shows analytics toggle", async ({ page }) => {
    await page.goto(`${BASE}/library`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "day" }).first()).toBeVisible();
  });
});

test.describe("Cookbooks analytics panels", () => {
  test("Cookbooks page shows analytics toggle", async ({ page }) => {
    await page.goto(`${BASE}/cookbooks`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "day" }).first()).toBeVisible();
  });
});

test.describe("Audit log panel — Kitchen Floor", () => {
  test("Audit Log panel renders on Kitchen Floor page", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Audit Log")).toBeVisible();
  });
});

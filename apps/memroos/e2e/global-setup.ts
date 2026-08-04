import { request, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Sign in once and hand every spec a real session.
 *
 * Without this, `/agents` (and every other operator route) 307s to `/login`,
 * so a spec asserting on page content fails with "element not found" and the
 * real cause — no session — is invisible. That is exactly how the Phase 225
 * viewport spec shipped un-runnable.
 *
 * Credentials come from the same env the app seeds its first admin from, so a
 * fresh worktree DB + `.env.local` is all the setup a run needs.
 */
export const STORAGE_STATE = path.join(__dirname, ".auth", "operator.json");

async function globalSetup(config: FullConfig) {
  const baseURL =
    process.env.E2E_BASE_URL ??
    config.projects[0]?.use?.baseURL ??
    "http://localhost:3002";
  const email = process.env.MEMROOS_ADMIN_EMAIL;
  const password = process.env.MEMROOS_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "e2e: MEMROOS_ADMIN_EMAIL and MEMROOS_ADMIN_PASSWORD must be set (see apps/memroos/.env.local). " +
        "Refusing to run unauthenticated — every operator route would redirect to /login and the " +
        "failures would look like missing UI.",
    );
  }

  const ctx = await request.newContext({ baseURL });
  const response = await ctx.post("/api/auth/login", {
    data: { email, password },
  });

  if (!response.ok()) {
    throw new Error(
      `e2e: login failed (${response.status()}) against ${baseURL}. ` +
        "If the DB was seeded before .env.local existed, delete the worktree data/ dir and restart the dev server.",
    );
  }

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await ctx.storageState({ path: STORAGE_STATE });

  // Layout specs need rows to measure. A fresh worktree DB has none, and an
  // empty table trivially "passes" an overlap check — so seed deterministic
  // fixtures rather than depending on whatever the operator's DB happens to
  // hold. Long names are the point: unbounded content is what overflowed the
  // grid tracks in the first place.
  const fixtures = [
    { id: "e2e-fixture-agent", name: "E2E Fixture Agent", role: "Viewport fixture" },
    {
      id: "e2e-fixture-agent-long",
      name: "E2E Fixture Agent With A Deliberately Long Display Name",
      role: "Write Episodic Memory And Other Unbounded Capability Text",
    },
  ];
  for (const fixture of fixtures) {
    const created = await ctx.post("/api/agents/register", {
      data: { ...fixture, platform: "claude", protocol: "rest" },
    });
    // Re-running against a warm DB is normal; only a genuine failure matters.
    if (!created.ok() && created.status() !== 409) {
      throw new Error(
        `e2e: could not seed fixture agent ${fixture.id} (${created.status()}): ${await created.text()}`,
      );
    }
  }

  await ctx.dispose();
}

export default globalSetup;

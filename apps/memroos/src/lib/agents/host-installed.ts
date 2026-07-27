/**
 * Agent harnesses actually installed on THIS machine.
 *
 * The registry was previously populated from `agents.config.json`, an
 * operator-wide list. Seeding it put Luis's laptop sessions ("Cursor Desktop",
 * "Codex Desktop") onto cordant-hermes-01, and even after scoping that down it
 * still listed the OpenClaw crew (Sophia, Maria, Gwen…) — personas that run
 * elsewhere and have no presence on that host at all.
 *
 * The only trustworthy answer to "which agents are on this machine" is to look
 * at the machine. A harness counts as installed when its binary resolves AND
 * it has a config directory, i.e. it has actually been run here — a binary
 * alone can arrive as a transitive dependency.
 *
 * Verified against cordant-hermes-01 2026-07-27: claude 2.1.183, codex-cli
 * 0.141.0, pi 0.80.7, OpenClaw 2026.7.1, plus the Hermes agent runtime.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AgentPlatform } from "@/types";

export interface DetectedHarness {
  /** Stable id, namespaced by host so two machines never collide. */
  id: string;
  name: string;
  role: string;
  platform: AgentPlatform;
  /** Resolved binary path, or null for runtimes detected by directory only. */
  binary: string | null;
  version: string | null;
  configDir: string;
}

interface HarnessProbe {
  bin: string;
  name: string;
  platform: AgentPlatform;
  role: string;
  /** Config dirs relative to $HOME; any one existing counts as "used here". */
  configDirs: string[];
  versionArgs?: string[];
}

const PROBES: HarnessProbe[] = [
  { bin: "claude", name: "Claude Code", platform: "claude", role: "Coding agent (CLI)", configDirs: [".claude"] },
  { bin: "codex", name: "Codex", platform: "codex", role: "Coding agent (CLI)", configDirs: [".codex"] },
  { bin: "pi", name: "Pi", platform: "pi", role: "Coding agent (CLI)", configDirs: [".pi"] },
  { bin: "openclaw", name: "OpenClaw", platform: "openclaw", role: "Agent runtime", configDirs: [".openclaw"] },
  { bin: "cursor-agent", name: "Cursor Agent", platform: "cursor", role: "Coding agent (CLI)", configDirs: [".cursor"] },
  { bin: "qwen", name: "Qwen", platform: "qwen", role: "Coding agent (CLI)", configDirs: [".qwen"] },
  { bin: "gemini", name: "Gemini", platform: "gemini", role: "Coding agent (CLI)", configDirs: [".gemini"] },
  { bin: "opencode", name: "OpenCode", platform: "opencode", role: "Coding agent (CLI)", configDirs: [".config/opencode"] },
  { bin: "zcode", name: "ZCode", platform: "zcode", role: "Coding agent (CLI)", configDirs: [".zcode"] },
];

/** Runtimes with no single binary on PATH, identified by their install tree. */
const RUNTIME_PROBES: Array<{
  id: string;
  name: string;
  role: string;
  platform: AgentPlatform;
  dir: string;
}> = [
  {
    id: "hermes",
    name: "Hermes",
    role: "Agent runtime",
    platform: "hermes",
    dir: ".hermes/hermes-agent",
  },
];

function which(bin: string): string | null {
  try {
    return execFileSync("which", [bin], { encoding: "utf-8", timeout: 2000 }).trim() || null;
  } catch {
    return null;
  }
}

function readVersion(bin: string, args: string[] = ["--version"]): string | null {
  try {
    const out = execFileSync(bin, args, { encoding: "utf-8", timeout: 8000 });
    return out.split("\n")[0]?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Scan the host for installed agent harnesses.
 *
 * `homeDir` is injectable so this is testable and so a containerised app can
 * be pointed at the operator's real home when one is mounted.
 */
export function detectInstalledHarnesses(opts: {
  hostId: string;
  homeDir?: string;
  /** Skip version probes — they exec each binary and cost ~100ms apiece. */
  skipVersions?: boolean;
} ): DetectedHarness[] {
  // In a container the app's own $HOME is the image's, not the operator's, so
  // scanning it would find nothing. MEMROOS_HOST_HOME points at the mounted
  // host home when one is available; absent that, this correctly returns an
  // empty list rather than guessing.
  const home =
    opts.homeDir ?? process.env.MEMROOS_HOST_HOME?.trim() ?? os.homedir();
  const found: DetectedHarness[] = [];

  for (const probe of PROBES) {
    const configDir = probe.configDirs
      .map((d) => path.join(home, d))
      .find((d) => fs.existsSync(d));
    // Requiring BOTH the binary and a config dir is what separates "installed
    // and used here" from "present as someone else's dependency".
    if (!configDir) continue;
    const binary = which(probe.bin);
    if (!binary) continue;

    found.push({
      id: `${opts.hostId}:${probe.bin}`,
      name: probe.name,
      role: probe.role,
      platform: probe.platform,
      binary,
      version: opts.skipVersions ? null : readVersion(binary, probe.versionArgs),
      configDir,
    });
  }

  for (const rt of RUNTIME_PROBES) {
    const dir = path.join(home, rt.dir);
    if (!fs.existsSync(dir)) continue;
    found.push({
      id: `${opts.hostId}:${rt.id}`,
      name: rt.name,
      role: rt.role,
      platform: rt.platform,
      binary: null,
      version: null,
      configDir: dir,
    });
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

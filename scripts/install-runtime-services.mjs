#!/usr/bin/env node
/**
 * Install MemRoOS runtime launchd jobs (macOS).
 *
 * Includes:
 * - com.memroos.context-health (15m) — context-source contract eval
 * - com.memroos.fathom-sync (3h) — Fathom dual-account ingest + qmd index meet-recordings
 *
 * Usage: node scripts/install-runtime-services.mjs [check|install|uninstall|status]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
const uid = process.getuid?.() ?? "";
const domain = `gui/${uid}`;
const envFile = path.join(root, ".env");
const memroosHome = path.join(os.homedir(), ".memroos");
const fathomSync = path.join(root, "scripts", "integrations", "fathom", "fathom-sync.sh");

/** @type {Array<{label: string, args: string[], stdout: string, stderr: string, interval: number, env?: Record<string, string>, runAtLoad?: boolean}>} */
export const jobs = [
  {
    label: "com.memroos.context-health",
    args: ["/usr/bin/env", "npm", "run", "eval:context-sources"],
    stdout: path.join(root, "services", "memory", "logs", "context-health.log"),
    stderr: path.join(root, "services", "memory", "logs", "context-health-error.log"),
    interval: 900,
  },
  {
    // Keep under meet-recordings freshnessThresholdMinutes (360).
    label: "com.memroos.fathom-sync",
    args: ["/bin/bash", fathomSync],
    stdout: path.join(memroosHome, "logs", "fathom-sync.log"),
    stderr: path.join(memroosHome, "logs", "fathom-sync-error.log"),
    interval: 10800,
    runAtLoad: false,
    env: {
      MEMROOS_ROOT: root,
      MEMROOS_HOME: memroosHome,
      FATHOM_ACCOUNTS_CONFIG: path.join(memroosHome, "integrations", "fathom-accounts.json"),
      QMD_FORCE_CPU: "1",
      PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    },
  },
];

export function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderJob(job) {
  const argsXml = job.args.map((arg) => `        <string>${xmlEscape(arg)}</string>`).join("\n");
  const extraEnv = {
    MEMROOS_ENV_FILE: envFile,
    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
    ...(job.env ?? {}),
  };
  const envXml = Object.entries(extraEnv)
    .map(([key, value]) => `        <key>${xmlEscape(key)}</key>\n        <string>${xmlEscape(value)}</string>`)
    .join("\n");
  const runAtLoadXml = job.runAtLoad ? "\n    <key>RunAtLoad</key>\n    <true/>" : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${xmlEscape(job.label)}</string>
    <key>WorkingDirectory</key>
    <string>${xmlEscape(root)}</string>
    <key>ProgramArguments</key>
    <array>
${argsXml}
    </array>
    <key>StartInterval</key>
    <integer>${job.interval}</integer>${runAtLoadXml}
    <key>StandardOutPath</key>
    <string>${xmlEscape(job.stdout)}</string>
    <key>StandardErrorPath</key>
    <string>${xmlEscape(job.stderr)}</string>
    <key>EnvironmentVariables</key>
    <dict>
${envXml}
    </dict>
</dict>
</plist>
`;
}

function plistPath(job, dir = launchAgentsDir) {
  return path.join(dir, `${job.label}.plist`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: options.stdio ?? "pipe" });
}

function tryRun(command, args, options = {}) {
  try {
    return run(command, args, options);
  } catch {
    return "";
  }
}

function check() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-runtime-services-"));
  try {
    for (const job of jobs) fs.writeFileSync(plistPath(job, tmp), renderJob(job));
    if (process.platform === "darwin") {
      for (const job of jobs) run("plutil", ["-lint", plistPath(job, tmp)], { stdio: "inherit" });
    }
    const labels = jobs.map((job) => job.label);
    if (!labels.includes("com.memroos.fathom-sync")) {
      throw new Error("Missing com.memroos.fathom-sync runtime job");
    }
    console.log(`Runtime service installer check passed (${labels.join(", ")})`);
  } finally {
    fs.rmSync(tmp, { force: true, recursive: true });
  }
}

function installLinuxCron() {
  const cronDir = path.join(memroosHome, "cron");
  fs.mkdirSync(cronDir, { recursive: true });
  fs.mkdirSync(path.join(memroosHome, "logs"), { recursive: true });
  const cronFile = path.join(cronDir, "fathom-sync.cron");
  const logFile = path.join(memroosHome, "logs", "fathom-sync.log");
  const line = `0 */3 * * * MEMROOS_ROOT=${root} MEMROOS_HOME=${memroosHome} /bin/bash ${fathomSync} >> ${logFile} 2>&1`;
  fs.writeFileSync(cronFile, `${line}\n`);

  // Merge into user crontab when crontab is available.
  const existing = tryRun("crontab", ["-l"]);
  const filtered = existing
    .split("\n")
    .filter((row) => row.trim() && !row.includes("fathom-sync.sh"))
    .join("\n");
  const next = `${filtered ? `${filtered}\n` : ""}${line}\n`;
  try {
    execFileSync("crontab", ["-"], { input: next, encoding: "utf8" });
    console.log(`Installed Linux cron for com.memroos.fathom-sync equivalent (every 3h): ${cronFile}`);
  } catch {
    console.log(`Wrote ${cronFile}`);
    console.log("Could not update user crontab automatically. Install with:");
    console.log(`  (crontab -l 2>/dev/null; cat ${cronFile}) | crontab -`);
  }
}

function install() {
  if (process.platform !== "darwin") {
    console.log("Runtime services launchd install is macOS-only.");
    installLinuxCron();
    return;
  }
  fs.mkdirSync(launchAgentsDir, { recursive: true });
  fs.mkdirSync(path.join(root, "services", "memory", "logs"), { recursive: true });
  fs.mkdirSync(path.join(memroosHome, "logs"), { recursive: true });
  for (const job of jobs) {
    const target = plistPath(job);
    fs.writeFileSync(target, renderJob(job));
    run("plutil", ["-lint", target], { stdio: "inherit" });
    tryRun("launchctl", ["bootout", domain, target], { stdio: "ignore" });
    run("launchctl", ["bootstrap", domain, target], { stdio: "inherit" });
    console.log(`Installed ${job.label} (every ${job.interval}s)`);
  }
}

function uninstall() {
  if (process.platform !== "darwin") return;
  for (const job of jobs) {
    const target = plistPath(job);
    tryRun("launchctl", ["bootout", domain, target], { stdio: "ignore" });
    fs.rmSync(target, { force: true });
  }
}

function status() {
  if (process.platform !== "darwin") {
    console.log("Runtime service status is macOS launchd-specific.");
    for (const job of jobs) console.log(`- ${job.label} interval=${job.interval}s`);
    return;
  }
  const output = run("launchctl", ["list"]);
  for (const job of jobs) console.log(output.split("\n").find((line) => line.includes(job.label)) || `- not loaded ${job.label}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const command = process.argv[2] || "check";
  if (command === "check") check();
  else if (command === "install") install();
  else if (command === "uninstall") uninstall();
  else if (command === "status") status();
  else {
    console.error("Usage: node scripts/install-runtime-services.mjs [check|install|uninstall|status]");
    process.exit(1);
  }
}

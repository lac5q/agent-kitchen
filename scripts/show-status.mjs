#!/usr/bin/env node
/**
 * MemroOS Status Dashboard
 * Shows what's running and how to access it.
 * Usage: node scripts/show-status.mjs
 *
 * Probes each declared service on its known health endpoint(s).
 * 3xx redirects are accepted as "alive" (Next.js auth/redirect chain).
 * 2xx response is "healthy".
 */

import { execSync } from 'node:child_process';

const SERVICES = [
  {
    name: 'MemroOS Web UI',
    url: 'http://localhost:3000',
    port: 3000,
    healthPaths: ['/api/health', '/health', '/'],
    // Next.js returns 307 redirects to login/dashboard - that's "alive"
    acceptStatuses: ['200', '301', '302', '307', '308'],
  },
  {
    name: 'Neo4j Browser',
    url: 'http://localhost:7474',
    port: 7474,
    healthPaths: ['/', '/browser'],
    acceptStatuses: ['200', '307'],
  },
  {
    name: 'mem0 API',
    url: 'http://localhost:3201',
    port: 3201,
    healthPaths: ['/health', '/'],
    acceptStatuses: ['200', '307'],
  },
  {
    name: 'Orchestration API',
    url: 'http://localhost:3210',
    port: 3210,
    healthPaths: ['/health', '/'],
    acceptStatuses: ['200', '307'],
  },
  {
    name: 'Voice Server',
    url: 'http://localhost:7860',
    port: 7860,
    optional: true,
    healthPaths: ['/health', '/'],
    acceptStatuses: ['200', '307'],
  },
];

function isPortOpen(port) {
  try {
    execSync(`lsof -ti :${port} >/dev/null 2>&1`);
    return true;
  } catch {
    return false;
  }
}

function probeHealth(url, paths, acceptStatuses) {
  // Try each path; first one that returns an accepted status code wins.
  for (const path of paths) {
    try {
      // -o /dev/null discards body; -w prints the status code
      const code = execSync(
        `curl -sS -o /dev/null -w "%{http_code}" --max-time 3 "${url}${path}"`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
      if (acceptStatuses.includes(code)) return { ok: true, code, path };
    } catch {
      // connection refused / timeout -> try next path
      continue;
    }
  }
  return { ok: false, code: null, path: null };
}

console.log('\n┌─────────────────────────────────────────┐');
console.log('│         MemroOS Status                  │');
console.log('└─────────────────────────────────────────┘\n');

let allHealthy = true;

for (const svc of SERVICES) {
  const running = isPortOpen(svc.port);
  const probe = running
    ? probeHealth(svc.url, svc.healthPaths, svc.acceptStatuses)
    : { ok: false, code: null, path: null };

  let icon, status;
  if (probe.ok) {
    icon = '✅';
    status = `healthy (HTTP ${probe.code})`;
  } else if (running) {
    icon = '⚠️ ';
    status = 'starting or unhealthy';
  } else if (svc.optional) {
    icon = '⬜';
    status = 'not running';
  } else {
    icon = '❌';
    status = 'down';
  }

  console.log(`${icon} ${svc.name}`);
  console.log(`   ${svc.url} (${status})`);

  if (!probe.ok && !svc.optional) allHealthy = false;
}

console.log('\n─────────────────────────────────────────');

if (allHealthy) {
  console.log('✅ MemroOS is running. Open http://localhost:3000');
} else {
  console.log('⚠️  Some services are still starting or unhealthy. Re-run in 30 seconds.');
}

console.log();
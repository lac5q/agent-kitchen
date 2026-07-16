/**
 * Phase 127 CLI entry — invoked by bin/memroos.mjs via Node strip-types + ts-loader.
 *
 * Subcommands:
 *   export --flat [--tenant T] [--out DIR] [--vault-root PATH]
 *   export --dsar --user U [--tenant T] [--out DIR]
 *   delete --user U [--tenant T]
 */

import path from "path";
import { pathToFileURL } from "url";

import { exportFlatVault } from "@/lib/export/flat-export";
import { deleteDsarUser, exportDsarPackage } from "@/lib/export/dsar-export";
import { getDb, closeDb } from "@/lib/db";

function printHelp(): void {
  console.log(`memroos — MemRoOS operator CLI (Phase 127)

Usage:
  memroos export --flat [--tenant <id>] [--out <dir>] [--vault-root <path>]
  memroos export --dsar --user <id> [--tenant <id>] [--out <dir>]
  memroos delete --user <id> [--tenant <id>] [--by <actor>]

Environment:
  KNOWLEDGE_ROOT / MEMROOS_KNOWLEDGE_ROOT  knowledge vault root
  MEMROOS_EXPORT_SIGNING_KEY               optional HMAC key for flat manifest
`);
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export async function runMemroosCli(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  if (args.length === 0 || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    printHelp();
    return 0;
  }

  const command = args[0];
  const tenantId = getFlag(args, "--tenant") ?? "default-tenant";
  const outDir = getFlag(args, "--out") ?? path.join(process.cwd(), "memroos-export");
  const vaultRoot = getFlag(args, "--vault-root");

  try {
    if (command === "export") {
      if (hasFlag(args, "--flat")) {
        const result = exportFlatVault({
          tenantId,
          outDir,
          vaultRoot,
        });
        console.log(JSON.stringify({
          ok: true,
          command: "export --flat",
          archivePath: result.archivePath,
          manifestPath: result.manifestPath,
          treeHash: result.manifest.treeHash,
          fileCount: result.manifest.fileCount,
          signatureAlg: result.manifest.signatureAlg,
        }, null, 2));
        return 0;
      }

      if (hasFlag(args, "--dsar")) {
        const userId = getFlag(args, "--user");
        if (!userId) {
          console.error("error: --user required for export --dsar");
          return 2;
        }
        const db = getDb();
        try {
          const result = exportDsarPackage({
            tenantId,
            userId,
            outDir,
            vaultRoot,
            db,
          });
          console.log(JSON.stringify({
            ok: true,
            command: "export --dsar",
            archivePath: result.archivePath,
            manifestPath: result.manifestPath,
            fileCount: result.fileCount,
            auditEntryCount: result.auditEntryCount,
          }, null, 2));
          return 0;
        } finally {
          closeDb();
        }
      }

      console.error("error: export requires --flat or --dsar");
      printHelp();
      return 2;
    }

    if (command === "delete") {
      const userId = getFlag(args, "--user");
      if (!userId) {
        console.error("error: --user required for delete");
        return 2;
      }
      const tombstonedBy = getFlag(args, "--by") ?? "cli:memroos";
      const db = getDb();
      try {
        const result = deleteDsarUser({
          tenantId,
          userId,
          tombstonedBy,
          db,
        });
        console.log(JSON.stringify({
          ok: true,
          command: "delete --user",
          tombstones: result.tombstones,
          auditRowsPreserved: result.auditRowsPreserved,
        }, null, 2));
        return 0;
      } finally {
        closeDb();
      }
    }

    console.error(`error: unknown command: ${command}`);
    printHelp();
    return 2;
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

const isDirect =
  typeof process.argv[1] === "string" &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirect || process.argv[1]?.includes("export/cli")) {
  runMemroosCli(process.argv).then((code) => {
    process.exit(code);
  });
}

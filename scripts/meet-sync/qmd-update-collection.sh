#!/usr/bin/env bash
# Reindex exactly one QMD collection via the QMD SDK.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: qmd-update-collection.sh <collection-name>" >&2
  exit 2
fi

COLLECTION="$1"
DB_PATH="${QMD_DB_PATH:-$HOME/.cache/qmd/index.sqlite}"
QMD_ROOT="$(npm root -g)/@tobilu/qmd"
QMD_INDEX_JS="$QMD_ROOT/dist/index.js"

if [[ ! -f "$QMD_INDEX_JS" ]]; then
  echo "ERROR: QMD SDK not found at $QMD_INDEX_JS" >&2
  exit 1
fi

node --input-type=module - "$COLLECTION" "$DB_PATH" "$QMD_INDEX_JS" <<'NODE'
const [collection, dbPath, qmdIndexJs] = process.argv.slice(2);
const { createStore } = await import(`file://${qmdIndexJs}`);
const store = await createStore({ dbPath });
try {
  const result = await store.update({ collections: [collection] });
  if (result.collections !== 1) {
    console.error(`ERROR: QMD collection not found: ${collection}`);
    process.exitCode = 1;
  } else {
    console.log(
      `qmd-update-collection ${collection}: indexed=${result.indexed} updated=${result.updated} unchanged=${result.unchanged} removed=${result.removed}`,
    );
  }
} finally {
  await store.close();
}
NODE

// STORECON-05 — one embedding cycle. Run from cron; does not rely on an
// in-process setInterval surviving inside the Next.js server runtime.
const LIMIT = parseInt(process.env.EMBED_LIMIT || "200", 10);
const OLLAMA = process.env.OLLAMA_URL || "http://172.18.0.1:11434";
(async () => {
  const db = require("better-sqlite3")("/data/conversations.db");
  const rows = db.prepare(
    "SELECT m.id, m.content FROM messages m LEFT JOIN message_embeddings e ON e.message_id = m.id WHERE e.message_id IS NULL AND m.content IS NOT NULL AND m.content != '' LIMIT ?"
  ).all(LIMIT);
  if (!rows.length) { console.log(JSON.stringify({ embedded: 0, backlog: 0, note: "caught up" })); return; }
  const ins = db.prepare("INSERT OR REPLACE INTO message_embeddings (message_id, model, dim, vector) VALUES (?,?,?,?)");
  let ok = 0, failed = 0;
  for (const r of rows) {
    try {
      const res = await fetch(`${OLLAMA}/api/embeddings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "nomic-embed-text", prompt: String(r.content).slice(0, 2000) }),
        signal: AbortSignal.timeout(15000),
      });
      const d = await res.json();
      if (d.embedding?.length) {
        ins.run(r.id, "nomic-embed-text", d.embedding.length, Buffer.from(new Float32Array(d.embedding).buffer));
        ok++;
      } else failed++;
    } catch { failed++; }
  }
  const total = db.prepare("SELECT COUNT(*) c FROM message_embeddings").get().c;
  const backlog = db.prepare("SELECT COUNT(*) c FROM messages m LEFT JOIN message_embeddings e ON e.message_id=m.id WHERE e.message_id IS NULL").get().c;
  console.log(JSON.stringify({ embedded: ok, failed, total, backlog }));
})();

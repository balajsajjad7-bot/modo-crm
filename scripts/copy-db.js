// Copies every row from the OLD Modo database into the NEW one (same tables). Safe to run more than once:
// rows that already exist are skipped. Used to bring old data back after moving databases.
// Run (GitHub → Actions → "Restore old Modo data"): needs secrets OLD_DATABASE_URL and NEW_DATABASE_URL.
const { Pool, neonConfig } = require("@neondatabase/serverless");
neonConfig.webSocketConstructor = require("ws");
const clean = (u) => { const x = new URL(u); ["pgbouncer", "connect_timeout", "channel_binding", "schema"].forEach((k) => x.searchParams.delete(k)); return x.toString(); };
const OLD = process.env.OLD_DATABASE_URL, NEW = process.env.NEW_DATABASE_URL;
if (!OLD || !NEW) { console.error("Set OLD_DATABASE_URL and NEW_DATABASE_URL."); process.exit(1); }
const q = (s) => '"' + s.replace(/"/g, '""') + '"';

(async () => {
  const src = new Pool({ connectionString: clean(OLD) }), dst = new Pool({ connectionString: clean(NEW) });
  const host = (u) => new URL(u).hostname.split(".")[0];
  console.log(`From ${host(OLD)} → to ${host(NEW)}`);
  const tables = (await src.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name not like '\\_%' order by 1`)).rows.map((r) => r.table_name);
  const have = new Set((await dst.query(`select table_name from information_schema.tables where table_schema='public'`)).rows.map((r) => r.table_name));
  let todo = tables.filter((t) => have.has(t)); const skipped = tables.filter((t) => !have.has(t));
  if (skipped.length) console.log("Not in the new database (skipped):", skipped.join(", "));
  const done = {};
  for (let pass = 1; pass <= 6 && todo.length; pass++) {
    const retry = [];
    for (const t of todo) {
      const cols = (await dst.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [t])).rows.map((r) => r.column_name);
      const srcCols = new Set((await src.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [t])).rows.map((r) => r.column_name));
      const use = cols.filter((c) => srcCols.has(c)); if (!use.length) continue;
      let copied = 0, offset = 0, fkFail = false;
      for (;;) {
        const rows = (await src.query(`select ${use.map(q).join(",")} from ${q(t)} order by 1 limit 200 offset ${offset}`)).rows;
        if (!rows.length) break;
        for (const row of rows) {
          try {
            const r = await dst.query(`insert into ${q(t)} (${use.map(q).join(",")}) values (${use.map((_, i) => "$" + (i + 1)).join(",")}) on conflict do nothing`, use.map((c) => row[c]));
            copied += r.rowCount;
          } catch (e) { if (e.code === "23503") fkFail = true; else console.log(`  ${t}: ${e.message.slice(0, 120)}`); }
        }
        offset += rows.length;
      }
      done[t] = (done[t] || 0) + copied;
      if (fkFail) retry.push(t);
    }
    todo = retry;
  }
  for (const [t, n] of Object.entries(done)) if (n) console.log(`${t}: ${n} rows copied`);
  if (todo.length) console.log("Some rows still waiting on linked rows:", todo.join(", "));
  await src.end(); await dst.end(); console.log("Done.");
})().catch((e) => { console.error("Restore failed:", e.code || "", e.message); process.exit(1); });

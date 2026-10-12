// Run SQL against db/esplain.db with foreign keys enforced.
//   npm run sql -- "SELECT * FROM devices"         query, printed as a table
//   npm run sql -- --json "SELECT ..."             query, printed as JSON
//   npm run sql -- -f path/to/file.sql             script, run in one transaction
//   cat file.sql | npm run sql                     same, from stdin
// A script either fully applies or leaves the database untouched.
import { readFileSync } from "node:fs";
import { openSqlite } from "../src/server/db.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
const f = args.indexOf("-f");
const rest = args.filter((a, i) => a !== "--json" && (f < 0 || (i !== f && i !== f + 1)));
const text = f >= 0 ? readFileSync(args[f + 1], "utf8") : rest.length ? rest.join(" ") : readFileSync(0, "utf8");

/** Split on semicolons outside strings and comments. */
function statements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      const end = sql.indexOf(c, i + 1) < 0 ? sql.length : sql.indexOf(c, i + 1);
      cur += sql.slice(i, end + 1);
      i = end;
      // Doubled quote is an escaped quote: keep scanning the same string.
      while (sql[i + 1] === c) {
        const next = sql.indexOf(c, i + 2) < 0 ? sql.length : sql.indexOf(c, i + 2);
        cur += sql.slice(i + 1, next + 1);
        i = next;
      }
    } else if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i) < 0 ? sql.length : sql.indexOf("\n", i);
      i = end;
      cur += "\n";
    } else if (c === "/" && sql[i + 1] === "*") {
      i = sql.indexOf("*/", i) < 0 ? sql.length : sql.indexOf("*/", i) + 1;
    } else if (c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function print(rows: Record<string, unknown>[]) {
  if (json) return console.log(JSON.stringify(rows, null, 2));
  if (rows.length === 0) return console.log("(no rows)");
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => (v === null ? "NULL" : String(v).replace(/\n/g, "\\n"));
  const width = cols.map((c) => Math.min(60, Math.max(c.length, ...rows.map((r) => cell(r[c]).length))));
  const fmt = (vals: string[]) => vals.map((v, i) => (v.length > width[i] ? v.slice(0, width[i] - 1) + "…" : v.padEnd(width[i]))).join("  ");
  console.log(fmt(cols));
  console.log(width.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(fmt(cols.map((c) => cell(r[c]))));
  console.log(`(${rows.length} row${rows.length === 1 ? "" : "s"})`);
}

const db = openSqlite();
const list = statements(text);
const single = list.length === 1 ? db.prepare(list[0]) : null;
if (single && single.columns().length > 0) {
  print(single.all() as Record<string, unknown>[]);
} else {
  db.exec("BEGIN IMMEDIATE");
  try {
    let changes = 0;
    for (const s of list) changes += Number(db.prepare(s).run().changes);
    const broken = db.prepare("PRAGMA foreign_key_check").all();
    if (broken.length) throw new Error(`foreign key violations: ${JSON.stringify(broken)}`);
    db.exec("COMMIT");
    console.log(`ok: ${list.length} statement(s), ${changes} row(s) changed`);
  } catch (e) {
    db.exec("ROLLBACK");
    console.error(`rolled back: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
db.close();

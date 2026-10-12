// Sanity checks for device data. Run after every change: npm run check [slug]
import { loadCatalog } from "../src/server/catalog.ts";
import { openSqlite } from "../src/server/db.ts";
import { SHAPES } from "../src/shapes.ts";
import type { Device, Part } from "../src/types.ts";

const CORE_SPECS = ["soc", "cpu", "cpu_mhz", "flash_mb", "wifi", "bluetooth", "gpio", "usb", "power_input"];
const only = process.argv[2];

const sqlite = openSqlite(true);
const fk = sqlite.prepare("PRAGMA foreign_key_check").all();
sqlite.close();

const catalog = await loadCatalog();
let errors = 0;
let warnings = 0;

if (fk.length) {
  errors += fk.length;
  console.log(`database\n  error: foreign key violations ${JSON.stringify(fk)}`);
}

function check(d: Device): [string[], string[]] {
  const err: string[] = [];
  const warn: string[] = [];
  const W2 = d.body.width / 2;
  const L2 = d.body.length / 2;
  const units = new Map(catalog.specKeys.map((k) => [k.key, k.unit]));

  for (const k of CORE_SPECS) if (!d.specs[k]) warn.push(`spec "${k}" missing`);
  for (const [k, s] of Object.entries(d.specs)) {
    if (units.get(k) && s.num === null) warn.push(`spec "${k}" has a unit but num is NULL`);
  }
  if (!d.url) warn.push("no product url");

  const name = (p: Part) => `${p.kind} "${p.key}"`;
  for (const p of d.parts) {
    if (!(SHAPES as readonly string[]).includes(p.shape)) err.push(`${name(p)}: unknown shape "${p.shape}"`);
    if (p.w <= 0 || p.l <= 0) err.push(`${name(p)}: w and l must be > 0`);
    const flat = p.shape === "pad" || p.shape === "hole" || p.shape === "castellated";
    if (p.kind === "component" && p.h <= 0 && !flat) err.push(`${name(p)}: components need h > 0`);
    if (Math.abs(p.x) > W2 + p.w / 2 || Math.abs(p.y) > L2 + p.l / 2) err.push(`${name(p)}: entirely off the body`);
    if (!p.description.trim()) warn.push(`${name(p)}: no description`);
    if (p.kind === "pin" && p.functions.length === 0) warn.push(`${name(p)}: no pin_functions`);
    if (p.shape === "hole" && !p.props.edge) {
      const r = (typeof p.props.drill === "number" ? p.props.drill : 1) / 2;
      if (Math.abs(p.x) + r > W2 || Math.abs(p.y) + r > L2) err.push(`${name(p)}: hole cuts the body edge`);
    }
    if (p.shape === "castellated") {
      const edge = Math.min(W2 - Math.abs(p.x), L2 - Math.abs(p.y));
      if (edge > 1.5) err.push(`${name(p)}: castellated pins must sit on an edge (centre is ${edge.toFixed(2)} mm in)`);
    }
  }

  const pins = d.parts.filter((p) => p.kind === "pin");
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      const [a, b] = [pins[i], pins[j]];
      const through = (p: Part) => p.shape === "castellated" || p.shape === "hole";
      const sameSide = a.side === b.side || through(a) || through(b);
      if (sameSide && Math.hypot(a.x - b.x, a.y - b.y) < 1) err.push(`pins "${a.key}" and "${b.key}" overlap`);
    }
  }

  for (const m of d.markings) {
    if (Math.abs(m.x) > W2 || Math.abs(m.y) > L2) err.push(`marking "${m.text}" is off the body`);
  }
  return [err, warn];
}

for (const d of catalog.devices) {
  if (only && d.slug !== only) continue;
  const [err, warn] = check(d);
  errors += err.length;
  warnings += warn.length;
  const pins = d.parts.filter((p) => p.kind === "pin").length;
  console.log(`${d.slug}: ${pins} pins, ${d.parts.length - pins} components, ${Object.keys(d.specs).length} specs`);
  for (const e of err) console.log(`  error: ${e}`);
  for (const w of warn) console.log(`  warn:  ${w}`);
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exitCode = errors ? 1 : 0;

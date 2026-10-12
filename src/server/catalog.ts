import type { Catalog, Device } from "../types.ts";
import { sql } from "kysely";
import { openDb } from "./db.ts";

export async function loadCatalog(): Promise<Catalog> {
  const db = openDb();
  try {
    const [categories, specKeys, devices, parts, functions, specs, markings] = await Promise.all([
      db.selectFrom("function_categories").select(["key", "label", "color"]).orderBy("sort").execute(),
      db
        .selectFrom("spec_keys")
        .select(["key", "label", "group_name as group", "unit"])
        .orderBy("sort")
        .execute(),
      db.selectFrom("devices").selectAll().orderBy("sort").orderBy("name").execute(),
      db.selectFrom("parts").selectAll().orderBy("sort").orderBy(sql`rowid`).execute(),
      db.selectFrom("pin_functions").selectAll().orderBy("sort").orderBy(sql`rowid`).execute(),
      db.selectFrom("specs").selectAll().execute(),
      db.selectFrom("markings").selectAll().orderBy(sql`rowid`).execute(),
    ]);

    const bySlug = new Map<string, Device>();
    for (const d of devices) {
      bySlug.set(d.slug, {
        slug: d.slug,
        name: d.name,
        vendor: d.vendor,
        summary: d.summary,
        description: d.description,
        url: d.url,
        body: {
          width: d.width_mm,
          length: d.length_mm,
          thickness: d.thickness_mm,
          cornerRadius: d.corner_radius_mm,
          color: d.color,
          silkColor: d.silk_color,
        },
        specs: {},
        parts: [],
        markings: [],
      });
    }

    for (const s of specs) {
      const d = bySlug.get(s.device);
      if (d) d.specs[s.key] = { value: s.value, num: s.num };
    }

    const partIndex = new Map<string, Device["parts"][number]>();
    for (const p of parts) {
      const d = bySlug.get(p.device);
      if (!d) continue;
      const part = {
        key: p.key,
        kind: p.kind,
        shape: p.shape,
        label: p.label,
        description: p.description,
        group: p.group_name,
        side: p.side,
        x: p.x,
        y: p.y,
        w: p.w,
        l: p.l,
        h: p.h,
        rotation: p.rotation,
        props: JSON.parse(p.props) as Record<string, unknown>,
        functions: [],
      };
      d.parts.push(part);
      partIndex.set(`${p.device}\u0000${p.key}`, part);
    }

    for (const f of functions) {
      partIndex.get(`${f.device}\u0000${f.part}`)?.functions.push({ name: f.name, category: f.category });
    }

    for (const m of markings) {
      const { device, ...rest } = m;
      bySlug.get(device)?.markings.push(rest);
    }

    return { categories, specKeys, devices: [...bySlug.values()] };
  } finally {
    await db.destroy();
  }
}

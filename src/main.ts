import "./style.css";
import type { Catalog, Device, Part } from "./types.ts";
import { Viewer, type View } from "./viewer/viewer.ts";

const app = document.getElementById("app")!;
let catalog: Catalog;
let viewer: Viewer | null = null;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plain text with blank-line paragraphs and `code` spans. */
const prose = (s: string) =>
  s
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim()).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\n/g, "<br>")}</p>`)
    .join("");

const mm = (n: number) => `${+n.toFixed(2)}`;
const dims = (d: Device) => `${mm(d.body.length)} × ${mm(d.body.width)} mm`;

function category(key: string) {
  return catalog.categories.find((c) => c.key === key);
}

function tags(p: Part) {
  return p.functions
    .map((f) => {
      const c = category(f.category);
      return `<span class="tag" style="--c:${c?.color ?? "#888"}" title="${esc(c?.label ?? f.category)}">${esc(f.name)}</span>`;
    })
    .join("");
}

function nav(active: string) {
  return `<header class="top">
    <a class="brand" href="#/">esplain</a>
    <nav>
      <a href="#/" class="${active === "devices" ? "on" : ""}">Devices</a>
      <a href="#/compare" class="${active === "compare" ? "on" : ""}">Compare</a>
    </nav>
  </header>`;
}

// ---------------------------------------------------------------- index

function renderIndex() {
  const keys = [
    ["soc", ""],
    ["wifi", ""],
    ["bluetooth", ""],
    ["flash_mb", "Flash "],
    ["psram_mb", "PSRAM "],
  ];
  const rows = catalog.devices
    .map((d) => {
      const facts = keys
        .filter(([k]) => d.specs[k])
        .map(([k, prefix]) => esc(prefix + d.specs[k].value))
        .join(" · ");
      return `<a class="device-row" href="#/d/${esc(d.slug)}">
        <div class="device-name">${esc(d.name)}</div>
        <div class="muted">${esc(d.vendor)} · ${dims(d)}</div>
        <div class="device-summary">${esc(d.summary)}</div>
        <div class="muted small">${facts}</div>
      </a>`;
    })
    .join("");
  app.innerHTML = `${nav("devices")}<main class="page">
    <h1>Devices</h1>
    <div class="device-list">${rows || `<p class="muted">No devices yet.</p>`}</div>
  </main>`;
}

// ---------------------------------------------------------------- device

function specTable(d: Device) {
  const groups = new Map<string, string[]>();
  for (const k of catalog.specKeys) {
    const s = d.specs[k.key];
    if (!s) continue;
    const rows = groups.get(k.group) ?? [];
    rows.push(`<tr><th>${esc(k.label)}</th><td>${esc(s.value)}</td></tr>`);
    groups.set(k.group, rows);
  }
  const physical = `<tr><th>Board size</th><td>${dims(d)}</td></tr>`;
  groups.set("Physical", [...(groups.get("Physical") ?? []), physical]);
  return [...groups]
    .map(([g, rows]) => `<tbody><tr class="group"><th colspan="2">${esc(g)}</th></tr>${rows.join("")}</tbody>`)
    .join("");
}

function partList(d: Device, kind: Part["kind"]) {
  const parts = d.parts.filter((p) => p.kind === kind);
  if (parts.length === 0) return "";
  const groups = new Map<string, Part[]>();
  for (const p of parts) {
    const g = p.group ?? (kind === "pin" ? "Pins" : "Components");
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const titled = groups.size > 1 || parts.some((p) => p.group);
  return [...groups]
    .map(
      ([g, ps]) => `${titled ? `<h3>${esc(g)}</h3>` : ""}<ul class="parts">${ps
        .map(
          (p) => `<li data-key="${esc(p.key)}"><span class="part-label">${esc(p.label)}</span><span class="tags">${tags(p)}</span></li>`,
        )
        .join("")}</ul>`,
    )
    .join("");
}

function partDetail(d: Device, p: Part | undefined) {
  if (!p) {
    return `<div class="detail empty"><p class="muted">Click a pin or component on the board, or pick one from the list.</p></div>`;
  }
  const where = [p.group, p.side === "bottom" ? "bottom side" : null].filter(Boolean).join(" · ");
  return `<div class="detail">
    <div class="detail-head">
      <h2>${esc(p.label)}</h2>
      <button class="close" data-close aria-label="Close">×</button>
    </div>
    ${where ? `<div class="muted small">${esc(where)}</div>` : ""}
    ${p.functions.length ? `<div class="tags">${tags(p)}</div>` : ""}
    <div class="prose">${prose(p.description || "No description yet.")}</div>
  </div>`;
}

function renderDevice(slug: string, partKey: string | null) {
  const d = catalog.devices.find((x) => x.slug === slug);
  if (!d) {
    app.innerHTML = `${nav("devices")}<main class="page"><h1>Not found</h1><p><a href="#/">All devices</a></p></main>`;
    return;
  }
  const selected = partKey ? d.parts.find((p) => p.key === partKey) : undefined;
  const legend = catalog.categories
    .filter((c) => d.parts.some((p) => p.functions.some((f) => f.category === c.key)))
    .map((c) => `<span class="legend-item"><i style="background:${c.color}"></i>${esc(c.label)}</span>`)
    .join("");

  app.innerHTML = `${nav("devices")}<main class="page device">
    <div class="device-head">
      <h1>${esc(d.name)}</h1>
      <div class="muted">${esc(d.vendor)}${d.url ? ` · <a href="${esc(d.url)}" target="_blank" rel="noreferrer">Product page</a>` : ""}</div>
    </div>
    <div class="device-grid">
      <section class="stage">
        <div class="viewer" id="viewer"></div>
        <div class="toolbar">
          <div class="seg">
            <button data-view="angle" class="on">3D</button>
            <button data-view="top">Top</button>
            <button data-view="bottom">Bottom</button>
          </div>
          <label class="check"><input type="checkbox" id="labels" checked> Pin labels</label>
        </div>
        <div class="legend">${legend}</div>
      </section>
      <aside class="side">
        <div id="detail">${partDetail(d, selected)}</div>
        <section class="card">
          <p class="summary">${esc(d.summary)}</p>
          ${d.description ? `<div class="prose muted">${prose(d.description)}</div>` : ""}
          <table class="specs">${specTable(d)}</table>
          <p class="small"><a href="#/compare/${esc(d.slug)}">Compare with other devices →</a></p>
        </section>
        <section class="card">
          <h2>Pins</h2>
          ${partList(d, "pin")}
        </section>
        <section class="card">
          <h2>Components</h2>
          ${partList(d, "component")}
        </section>
      </aside>
    </div>
  </main>`;

  const select = (key: string | null, fromViewer: boolean) => {
    const p = key ? d.parts.find((x) => x.key === key) : undefined;
    viewer?.select(p ? p.key : null);
    document.getElementById("detail")!.innerHTML = partDetail(d, p);
    for (const li of app.querySelectorAll<HTMLElement>(".parts li")) {
      li.classList.toggle("on", li.dataset.key === key);
    }
    const hash = p ? `#/d/${d.slug}/${encodeURIComponent(p.key)}` : `#/d/${d.slug}`;
    history.replaceState(null, "", hash);
    if (fromViewer && p) document.getElementById("detail")!.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  viewer = new Viewer(document.getElementById("viewer")!, d, {
    onSelect: (key) => select(key, true),
    onHover: (key) => {
      for (const li of app.querySelectorAll<HTMLElement>(".parts li")) li.classList.toggle("hover", li.dataset.key === key);
    },
  });
  if (selected) select(selected.key, false);

  app.querySelector(".side")!.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-close]")) return select(null, false);
    const li = t.closest<HTMLElement>(".parts li");
    if (li) select(li.dataset.key!, false);
  });
  for (const li of app.querySelectorAll<HTMLElement>(".parts li")) {
    li.addEventListener("mouseenter", () => viewer?.hover(li.dataset.key!));
    li.addEventListener("mouseleave", () => viewer?.hover(null));
  }
  for (const b of app.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    b.addEventListener("click", () => {
      viewer?.setView(b.dataset.view as View);
      for (const o of app.querySelectorAll("[data-view]")) o.classList.toggle("on", o === b);
    });
  }
  document.getElementById("labels")!.addEventListener("change", (e) => {
    viewer?.setLabels((e.target as HTMLInputElement).checked);
  });
}

// ---------------------------------------------------------------- compare

function pinSummary(d: Device): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of d.parts) {
    if (p.kind !== "pin") continue;
    for (const c of new Set(p.functions.map((f) => f.category))) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return counts;
}

function renderCompare(slugs: string[]) {
  const chosen = slugs.length ? catalog.devices.filter((d) => slugs.includes(d.slug)) : catalog.devices.slice(0, 4);
  const picker = catalog.devices
    .map((d) => {
      const on = chosen.includes(d);
      const next = on ? chosen.filter((x) => x !== d) : [...chosen, d];
      return `<a class="chip ${on ? "on" : ""}" href="#/compare/${next.map((x) => x.slug).join(",")}">${esc(d.name)}</a>`;
    })
    .join("");

  const row = (label: string, values: string[], unit = "") => {
    const differs = new Set(values).size > 1;
    return `<tr class="${differs ? "differs" : ""}"><th>${esc(label)}${unit ? ` <span class="muted">(${esc(unit)})</span>` : ""}</th>${values
      .map((v) => `<td>${v ? esc(v) : `<span class="muted">—</span>`}</td>`)
      .join("")}</tr>`;
  };

  const groups = new Map<string, string[]>();
  for (const k of catalog.specKeys) {
    if (!chosen.some((d) => d.specs[k.key])) continue;
    const rows = groups.get(k.group) ?? [];
    rows.push(row(k.label, chosen.map((d) => d.specs[k.key]?.value ?? "")));
    groups.set(k.group, rows);
  }
  groups.set("Physical", [
    ...(groups.get("Physical") ?? []),
    row("Board size", chosen.map(dims)),
  ]);
  const pins = chosen.map(pinSummary);
  const pinRows = [row("Pins & pads", chosen.map((d) => String(d.parts.filter((p) => p.kind === "pin").length)))];
  for (const c of catalog.categories) {
    if (!pins.some((m) => m.has(c.key))) continue;
    pinRows.push(row(c.label, pins.map((m) => String(m.get(c.key) ?? 0)), "pins"));
  }
  groups.set("Pinout (from the model)", pinRows);

  const head = chosen.map((d) => `<th><a href="#/d/${esc(d.slug)}">${esc(d.name)}</a></th>`).join("");
  const body = [...groups]
    .map(([g, rows]) => `<tbody><tr class="group"><th colspan="${chosen.length + 1}">${esc(g)}</th></tr>${rows.join("")}</tbody>`)
    .join("");

  app.innerHTML = `${nav("compare")}<main class="page">
    <h1>Compare</h1>
    <div class="chips">${picker}</div>
    ${
      chosen.length
        ? `<div class="table-wrap"><table class="compare"><thead><tr><th></th>${head}</tr></thead>${body}</table></div>
           <p class="muted small">Highlighted rows differ between the selected devices.</p>`
        : `<p class="muted">Pick devices to compare.</p>`
    }
  </main>`;
}

// ---------------------------------------------------------------- routing

function route() {
  viewer?.dispose();
  viewer = null;
  const [, page = "", a = "", b = ""] = location.hash.replace(/^#/, "").split("/");
  if (page === "d") renderDevice(decodeURIComponent(a), b ? decodeURIComponent(b) : null);
  else if (page === "compare") renderCompare(a ? a.split(",").map(decodeURIComponent) : []);
  else renderIndex();
  window.scrollTo(0, 0);
}

async function main() {
  const res = await fetch("data/catalog.json", { cache: "no-cache" });
  catalog = (await res.json()) as Catalog;
  window.addEventListener("hashchange", route);
  route();
}

main().catch((e: unknown) => {
  app.innerHTML = `<main class="page"><h1>Failed to load</h1><pre>${esc(String(e))}</pre></main>`;
});

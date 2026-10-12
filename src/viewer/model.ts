// Builds a three.js model of a device from its catalog entry.
// World frame: PCB x -> world x, PCB y -> world -z, height -> world y.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Shape } from "../shapes.ts";
import type { Body, Device, Part } from "../types.ts";
import { labelTexture, silkTexture } from "./textures.ts";

type Edge = "left" | "right" | "top" | "bottom";

const mat = {
  gold: () => new THREE.MeshStandardMaterial({ color: "#d9b26a", metalness: 1, roughness: 0.32 }),
  steel: () => new THREE.MeshStandardMaterial({ color: "#d4d6d8", metalness: 1, roughness: 0.32 }),
  tin: () => new THREE.MeshStandardMaterial({ color: "#c9cbcc", metalness: 1, roughness: 0.42 }),
  black: () => new THREE.MeshStandardMaterial({ color: "#151517", metalness: 0, roughness: 0.55 }),
  plastic: (color: string) => new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.5 }),
};

const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);

/** Nearest body edge to a point, and the coordinate along that edge. */
function nearestEdge(body: Body, x: number, y: number): { edge: Edge; at: number } {
  const d = {
    left: Math.abs(x + body.width / 2),
    right: Math.abs(body.width / 2 - x),
    top: Math.abs(body.length / 2 - y),
    bottom: Math.abs(y + body.length / 2),
  };
  const edge = (Object.keys(d) as Edge[]).reduce((a, b) => (d[a] <= d[b] ? a : b));
  return { edge, at: edge === "left" || edge === "right" ? y : x };
}

interface Notch {
  edge: Edge;
  at: number;
  r: number;
}

/** Rectangle traced counter-clockwise, with semicircular bites on its edges. */
function notchedRect(x0: number, x1: number, y0: number, y1: number, r: number, notches: Notch[]): THREE.Shape {
  const s = new THREE.Shape();
  const on = (e: Edge) => notches.filter((n) => n.edge === e);
  const PI = Math.PI;
  s.moveTo(x0 + r, y0);
  for (const n of on("bottom").sort((a, b) => a.at - b.at)) s.absarc(n.at, y0, n.r, PI, 0, true);
  s.lineTo(x1 - r, y0);
  if (r > 0) s.absarc(x1 - r, y0 + r, r, -PI / 2, 0, false);
  for (const n of on("right").sort((a, b) => a.at - b.at)) s.absarc(x1, n.at, n.r, -PI / 2, PI / 2, true);
  s.lineTo(x1, y1 - r);
  if (r > 0) s.absarc(x1 - r, y1 - r, r, 0, PI / 2, false);
  for (const n of on("top").sort((a, b) => b.at - a.at)) s.absarc(n.at, y1, n.r, 0, PI, true);
  s.lineTo(x0 + r, y1);
  if (r > 0) s.absarc(x0 + r, y1 - r, r, PI / 2, PI, false);
  for (const n of on("left").sort((a, b) => b.at - a.at)) s.absarc(x0, n.at, n.r, PI / 2, -PI / 2, true);
  s.lineTo(x0, y0 + r);
  if (r > 0) s.absarc(x0 + r, y0 + r, r, PI, (3 * PI) / 2, false);
  return s;
}

/** Flat shape in PCB (x, y) -> geometry lying on the surface, extruded up by `depth`. */
function slab(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
  g.rotateX(-Math.PI / 2);
  return g;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, y = 0): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.position.y = y;
  out.castShadow = true;
  out.receiveShadow = true;
  return out;
}

function castellatedNotch(body: Body, p: Part): Notch {
  const { edge, at } = nearestEdge(body, p.x, p.y);
  return { edge, at, r: num(p.props.drill, 1) / 2 };
}

// ---------------------------------------------------------------- shapes
// Each builder returns an object in the part's local frame: origin at the
// part centre on the surface, +y pointing away from the board.

type Builder = (p: Part, body: Body) => THREE.Object3D;

const COPPER = 0.04;

const builders: Record<Shape, Builder> = {
  castellated(p, body) {
    const g = new THREE.Group();
    const n = castellatedNotch(body, p);
    const W2 = body.width / 2;
    const L2 = body.length / 2;
    // Pad rectangle, forced flush with the edge, in coordinates relative to the part.
    let [x0, x1, y0, y1] = [p.x - p.w / 2, p.x + p.w / 2, p.y - p.l / 2, p.y + p.l / 2];
    if (n.edge === "left") x0 = -W2;
    if (n.edge === "right") x1 = W2;
    if (n.edge === "top") y1 = L2;
    if (n.edge === "bottom") y0 = -L2;
    const local = { ...n, at: n.at - (n.edge === "left" || n.edge === "right" ? p.y : p.x) };
    const shape = notchedRect(x0 - p.x, x1 - p.x, y0 - p.y, y1 - p.y, 0, [local]);
    const gold = mat.gold();
    g.add(mesh(slab(shape, COPPER), gold));
    g.add(mesh(slab(shape, COPPER), gold, -body.thickness - COPPER));
    // Plating inside the half hole.
    const cx = n.edge === "left" ? -W2 - p.x : n.edge === "right" ? W2 - p.x : local.at;
    const cy = n.edge === "top" ? L2 - p.y : n.edge === "bottom" ? -L2 - p.y : local.at;
    const start = { left: 0, right: Math.PI, top: -Math.PI / 2, bottom: Math.PI / 2 }[n.edge];
    const barrel = new THREE.CylinderGeometry(n.r, n.r, body.thickness, 24, 1, true, start, Math.PI);
    const b = mesh(barrel, new THREE.MeshStandardMaterial({ color: "#e2bd72", metalness: 1, roughness: 0.3, side: THREE.DoubleSide }));
    b.position.set(cx, -body.thickness / 2, -cy);
    g.add(b);
    return g;
  },

  pad(p) {
    const r = p.props.round ? Math.min(p.w, p.l) / 2 : num(p.props.radius, 0.1);
    return mesh(slab(notchedRect(-p.w / 2, p.w / 2, -p.l / 2, p.l / 2, r, []), COPPER), mat.gold());
  },

  usb_c(p) {
    // Opening faces +y (towards the board edge) at rotation 0.
    const g = new THREE.Group();
    const stadium = (w: number, h: number, y0: number) => notchedRect(-w / 2, w / 2, y0, y0 + h, h / 2, []);
    const wall = 0.25;
    const shell = stadium(p.w, p.h, 0);
    const inner = stadium(p.w - wall * 2, p.h - wall * 2, wall);
    shell.holes.push(inner);
    const tube = new THREE.ExtrudeGeometry(shell, { depth: p.l, bevelEnabled: false, curveSegments: 24 });
    tube.translate(0, 0, -p.l / 2);
    g.add(mesh(tube, mat.steel()));
    const back = new THREE.ExtrudeGeometry(inner, { depth: p.l * 0.6, bevelEnabled: false, curveSegments: 24 });
    back.translate(0, 0, p.l / 2 - p.l * 0.6);
    g.add(mesh(back, mat.black()));
    const tongue = new THREE.BoxGeometry(p.w * 0.72, 0.6, p.l * 0.85);
    tongue.translate(0, p.h / 2, p.l / 2 - (p.l * 0.85) / 2);
    g.add(mesh(tongue, mat.black()));
    const contacts = new THREE.BoxGeometry(p.w * 0.6, 0.62, 1.2);
    contacts.translate(0, p.h / 2, p.l / 2 - p.l * 0.85 + 0.7);
    g.add(mesh(contacts, mat.gold()));
    return g;
  },

  button(p) {
    const g = new THREE.Group();
    const baseH = p.h * 0.45;
    g.add(mesh(new THREE.BoxGeometry(p.w, baseH, p.l).translate(0, baseH / 2, 0), mat.plastic(str(p.props.body_color, "#e9e7e2"))));
    g.add(mesh(new THREE.BoxGeometry(p.w * 0.98, 0.12, p.l * 0.98).translate(0, baseH + 0.06, 0), mat.steel()));
    const d = Math.min(p.w, p.l) * num(p.props.cap_ratio, 0.6);
    const capH = p.h - baseH - 0.12;
    const cap = new THREE.CylinderGeometry(d / 2, d / 2, capH, 32).translate(0, baseH + 0.12 + capH / 2, 0);
    g.add(mesh(cap, mat.plastic(str(p.props.cap_color, "#1b1b1d"))));
    return g;
  },

  led(p) {
    const g = new THREE.Group();
    const color = str(p.props.color, "#ff3b30");
    const along = p.l >= p.w ? "z" : "x";
    const cap = 0.22 * Math.max(p.w, p.l);
    const lens = new THREE.MeshPhysicalMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      roughness: 0.15,
      clearcoat: 1,
    });
    const body = new THREE.BoxGeometry(along === "x" ? p.w - cap * 2 : p.w, p.h, along === "z" ? p.l - cap * 2 : p.l);
    g.add(mesh(body.translate(0, p.h / 2, 0), lens));
    for (const s of [-1, 1]) {
      const end = new THREE.BoxGeometry(along === "x" ? cap : p.w, p.h * 0.9, along === "z" ? cap : p.l);
      const off = (Math.max(p.w, p.l) - cap) / 2;
      end.translate(along === "x" ? s * off : 0, (p.h * 0.9) / 2, along === "z" ? s * off : 0);
      g.add(mesh(end, mat.tin()));
    }
    return g;
  },

  shield(p) {
    const g = new THREE.Group();
    const box = new RoundedBoxGeometry(p.w, p.h, p.l, 3, 0.2).translate(0, p.h / 2, 0);
    g.add(mesh(box, mat.tin()));
    const text = str(p.props.label, "");
    if (text) {
      const inset = num(p.props.label_inset, 0.5);
      const w = p.w - inset * 2;
      const l = p.l - inset * 2;
      const bg = typeof p.props.label_bg === "string" ? p.props.label_bg : null;
      const tex = labelTexture(w, l, text, bg, str(p.props.label_fg, "#1c1c1e"));
      const m = new THREE.MeshStandardMaterial({ map: tex, transparent: !bg, roughness: 0.6, metalness: 0 });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), m);
      plane.position.y = p.h + 0.01;
      plane.receiveShadow = true;
      g.add(plane);
    }
    return g;
  },

  ufl(p) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(p.w, 0.25, p.l).translate(0, 0.125, 0), mat.plastic("#e8e2d4")));
    const r = Math.min(p.w, p.l) * 0.4;
    g.add(mesh(new THREE.CylinderGeometry(r, r, p.h, 32).translate(0, p.h / 2, 0), mat.gold()));
    g.add(mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.02, 32).translate(0, p.h + 0.01, 0), mat.plastic("#f2efe8")));
    g.add(mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.18, 0.1, 16).translate(0, p.h + 0.05, 0), mat.gold()));
    return g;
  },

  chip(p) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(p.w, p.h, p.l).translate(0, p.h / 2, 0), mat.plastic(str(p.props.color, "#1e1e20"))));
    const text = str(p.props.text, "");
    if (text) {
      const tex = labelTexture(p.w, p.l, text, null, str(p.props.text_color, "#b8b8b8"));
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(p.w, p.l).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7 }),
      );
      plane.position.y = p.h + 0.005;
      g.add(plane);
    }
    return g;
  },

  box(p) {
    const m = new THREE.MeshStandardMaterial({
      color: str(p.props.color, "#2c2c2e"),
      metalness: num(p.props.metalness, 0),
      roughness: num(p.props.roughness, 0.5),
    });
    return mesh(new THREE.BoxGeometry(p.w, p.h, p.l).translate(0, p.h / 2, 0), m);
  },
};

// ---------------------------------------------------------------- body

function buildBody(device: Device): THREE.Group {
  const { body } = device;
  const g = new THREE.Group();
  const notches = device.parts.filter((p) => p.shape === "castellated").map((p) => castellatedNotch(body, p));
  const W2 = body.width / 2;
  const L2 = body.length / 2;
  const shape = notchedRect(-W2, W2, -L2, L2, body.cornerRadius, notches);
  const geo = slab(shape, body.thickness).translate(0, -body.thickness, 0);
  const mask = new THREE.MeshPhysicalMaterial({
    color: body.color,
    roughness: 0.55,
    clearcoat: 0.15,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.3,
  });
  // Cut FR4 edge, tinted towards the soldermask colour.
  const edge = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#a8976a").lerp(new THREE.Color(body.color), 0.45),
    roughness: 0.85,
  });
  const board = new THREE.Mesh(geo, [mask, edge]);
  board.receiveShadow = true;
  board.castShadow = true;
  g.add(board);

  for (const side of ["top", "bottom"] as const) {
    const tex = silkTexture(body, device.markings, side);
    if (!tex) continue;
    const plane = new THREE.PlaneGeometry(body.width, body.length).rotateX(-Math.PI / 2);
    if (side === "bottom") plane.rotateZ(Math.PI);
    const m = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 0.7,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const silk = new THREE.Mesh(plane, m);
    silk.position.y = side === "top" ? 0.001 : -body.thickness - 0.001;
    silk.receiveShadow = true;
    g.add(silk);
  }
  return g;
}

// ---------------------------------------------------------------- model

export interface PartObject {
  part: Part;
  object: THREE.Object3D;
  /** Invisible box used for picking; generous so small pins are easy to hit. */
  hit: THREE.Mesh;
  /** Point the on-screen label is attached to. */
  anchor: THREE.Vector3;
  materials: THREE.MeshStandardMaterial[];
}

export interface Model {
  root: THREE.Group;
  parts: Map<string, PartObject>;
  size: THREE.Vector3;
}

const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });

export function buildModel(device: Device): Model {
  const root = new THREE.Group();
  const { body } = device;
  const t = body.thickness;
  // Centre the board vertically on the origin.
  const content = new THREE.Group();
  content.position.y = t / 2;
  root.add(content);
  content.add(buildBody(device));

  const parts = new Map<string, PartObject>();
  for (const p of device.parts) {
    const build = builders[p.shape as Shape] ?? builders.box;
    const outer = new THREE.Group();
    outer.position.set(p.x, p.side === "top" ? 0 : -t, -p.y);
    if (p.side === "bottom") outer.rotation.z = Math.PI;
    const inner = build(p, body);
    inner.rotation.y = ((p.side === "top" ? 1 : -1) * p.rotation * Math.PI) / 180;
    outer.add(inner);
    outer.userData.key = p.key;
    content.add(outer);

    // Own materials per part so highlighting one does not light up the rest.
    const materials: THREE.MeshStandardMaterial[] = [];
    outer.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        o.material = o.material.clone();
        o.material.userData.color = o.material.color.clone();
        o.material.userData.emissive = o.material.emissive.clone();
        o.material.userData.emissiveIntensity = o.material.emissiveIntensity;
        materials.push(o.material);
      }
    });

    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(outer);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const min = p.kind === "pin" ? 2 : 0.8;
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(size.x, min), Math.max(size.y, 0.6), Math.max(size.z, min)),
      hitMaterial,
    );
    hit.position.copy(center);
    hit.userData.key = p.key;
    root.add(hit);

    const anchor = center.clone();
    if (p.shape !== "castellated") anchor.y = p.side === "top" ? box.max.y : box.min.y;
    parts.set(p.key, { part: p, object: outer, hit, anchor, materials });
  }

  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  return { root, parts, size };
}

export function setHighlight(po: PartObject, level: 0 | 1 | 2): void {
  const accent = new THREE.Color("#0a84ff");
  for (const m of po.materials) {
    const { color, emissive, emissiveIntensity } = m.userData as {
      color: THREE.Color;
      emissive: THREE.Color;
      emissiveIntensity: number;
    };
    if (level === 0) {
      m.color.copy(color);
      m.emissive.copy(emissive);
      m.emissiveIntensity = emissiveIntensity;
    } else {
      m.color.copy(color).lerp(accent, level === 1 ? 0.5 : 0.85);
      m.emissive.copy(accent);
      m.emissiveIntensity = level === 1 ? 0.15 : 0.35;
    }
  }
}

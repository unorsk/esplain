import * as THREE from "three";
import type { Body, Marking, Side } from "../types.ts";

export const FONT = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`;

function canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function pxPerMm(w: number, l: number): number {
  return Math.min(64, 2048 / Math.max(w, l));
}

/** Transparent texture with the silkscreen text of one side of the body. */
export function silkTexture(body: Body, markings: Marking[], side: Side): THREE.CanvasTexture | null {
  const items = markings.filter((m) => m.side === side);
  if (items.length === 0) return null;
  const s = pxPerMm(body.width, body.length);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(body.width * s);
  canvas.height = Math.round(body.length * s);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = body.silkColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const m of items) {
    // The bottom side is drawn as seen from below, flipped left-right.
    const px = (side === "top" ? m.x + body.width / 2 : body.width / 2 - m.x) * s;
    const py = (body.length / 2 - m.y) * s;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((-m.rotation * Math.PI) / 180);
    ctx.font = `600 ${(m.size / 0.72) * s}px ${FONT}`;
    ctx.fillText(m.text, 0, 0);
    ctx.restore();
  }
  return canvasTexture(canvas);
}

/**
 * Printed label for the top of a component. The first line is a heading,
 * the remaining lines are smaller body text.
 */
export function labelTexture(w: number, l: number, text: string, bg: string | null, fg: string): THREE.CanvasTexture {
  const s = pxPerMm(w, l) * 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * s);
  canvas.height = Math.round(l * s);
  const ctx = canvas.getContext("2d")!;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const [head = "", ...rest] = text.split("\n");
  const pad = canvas.width * 0.07;
  const maxW = canvas.width - pad * 2;
  ctx.fillStyle = fg;
  ctx.textBaseline = "top";

  const fit = (line: string, weight: number, size: number) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const m = ctx.measureText(line).width;
    if (m > maxW) ctx.font = `${weight} ${(size * maxW) / m}px ${FONT}`;
  };

  let y = pad;
  const headSize = canvas.height * 0.15;
  fit(head, 700, headSize);
  ctx.fillText(head, pad, y);
  y += headSize * 1.35;
  const bodySize = canvas.height * 0.075;
  for (const line of rest) {
    fit(line, 500, bodySize);
    ctx.fillText(line, pad, y);
    y += bodySize * 1.45;
  }
  return canvasTexture(canvas);
}

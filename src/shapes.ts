// Renderer primitives a part can use (parts.shape). Documented in AGENTS.md.
export const SHAPES = [
  "castellated",
  "hole",
  "pad",
  "usb_c",
  "button",
  "side_button",
  "led",
  "shield",
  "module",
  "ufl",
  "jst",
  "fpc",
  "chip",
  "antenna",
  "box",
] as const;
export type Shape = (typeof SHAPES)[number];

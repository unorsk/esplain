// Renderer primitives a part can use (parts.shape). Documented in AGENTS.md.
export const SHAPES = ["castellated", "pad", "usb_c", "button", "led", "shield", "ufl", "chip", "box"] as const;
export type Shape = (typeof SHAPES)[number];

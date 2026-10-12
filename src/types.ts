// Shape of data/catalog.json, produced by src/server/catalog.ts.

export type Side = "top" | "bottom";

export interface Category {
  key: string;
  label: string;
  color: string;
}

export interface SpecKey {
  key: string;
  label: string;
  group: string;
  unit: string | null;
}

export interface Spec {
  value: string;
  num: number | null;
}

export interface PinFunction {
  name: string;
  category: string;
}

export interface Part {
  key: string;
  kind: "pin" | "component";
  shape: string;
  label: string;
  description: string;
  group: string | null;
  side: Side;
  x: number;
  y: number;
  w: number;
  l: number;
  h: number;
  rotation: number;
  props: Record<string, unknown>;
  functions: PinFunction[];
}

export interface Marking {
  side: Side;
  text: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
}

export interface Body {
  width: number;
  length: number;
  thickness: number;
  cornerRadius: number;
  color: string;
  silkColor: string;
}

export interface Device {
  slug: string;
  name: string;
  vendor: string;
  summary: string;
  description: string;
  url: string | null;
  body: Body;
  specs: Record<string, Spec>;
  parts: Part[];
  markings: Marking[];
}

export interface Catalog {
  categories: Category[];
  specKeys: SpecKey[];
  devices: Device[];
}

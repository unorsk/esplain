// Kysely table types. Keep in sync with db/schema.sql when adding migrations.
import type { Generated } from "kysely";

export interface DevicesTable {
  slug: string;
  name: string;
  vendor: string;
  summary: string;
  description: Generated<string>;
  url: string | null;
  width_mm: number;
  length_mm: number;
  thickness_mm: Generated<number>;
  corner_radius_mm: Generated<number>;
  color: Generated<string>;
  silk_color: Generated<string>;
  sort: Generated<number>;
}

export interface PartsTable {
  device: string;
  key: string;
  kind: "pin" | "component";
  shape: string;
  label: string;
  description: Generated<string>;
  group_name: string | null;
  side: Generated<"top" | "bottom">;
  x: number;
  y: number;
  w: number;
  l: number;
  h: Generated<number>;
  rotation: Generated<number>;
  props: Generated<string>;
  sort: Generated<number>;
}

export interface FunctionCategoriesTable {
  key: string;
  label: string;
  color: string;
  sort: Generated<number>;
}

export interface PinFunctionsTable {
  device: string;
  part: string;
  name: string;
  category: string;
  sort: Generated<number>;
}

export interface SpecKeysTable {
  key: string;
  label: string;
  group_name: string;
  unit: string | null;
  sort: Generated<number>;
  hint: Generated<string>;
}

export interface SpecsTable {
  device: string;
  key: string;
  value: string;
  num: number | null;
}

export interface MarkingsTable {
  device: string;
  side: Generated<"top" | "bottom">;
  text: string;
  x: number;
  y: number;
  size: Generated<number>;
  rotation: Generated<number>;
  align: Generated<"start" | "center" | "end">;
}

export interface DB {
  devices: DevicesTable;
  parts: PartsTable;
  function_categories: FunctionCategoriesTable;
  pin_functions: PinFunctionsTable;
  spec_keys: SpecKeysTable;
  specs: SpecsTable;
  markings: MarkingsTable;
}

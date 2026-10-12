import type { BuildOptions } from "esbuild";

export const bundleOptions: BuildOptions = {
  entryPoints: { app: "src/main.ts" },
  bundle: true,
  format: "esm",
  target: "es2022",
  outdir: "dist",
  logLevel: "warning",
};

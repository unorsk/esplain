// Static build for GitHub Pages: bundle, copy public/, export the database to data/catalog.json.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as esbuild from "esbuild";
import { loadCatalog } from "../src/server/catalog.ts";
import { bundleOptions } from "./bundle.ts";

rmSync("dist", { recursive: true, force: true });
await esbuild.build({ ...bundleOptions, minify: true });
cpSync("index.html", "dist/index.html");
if (existsSync("public")) cpSync("public", "dist", { recursive: true });
mkdirSync("dist/data", { recursive: true });
const catalog = await loadCatalog();
writeFileSync("dist/data/catalog.json", JSON.stringify(catalog));
console.log(`dist/ built with ${catalog.devices.length} device(s)`);

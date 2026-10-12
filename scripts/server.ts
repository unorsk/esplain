// Local server: bundles on request, serves the catalog live from SQLite,
// and (with live: true) reloads the page when sources or the database change.
import { createReadStream, existsSync, readFileSync, statSync, watch } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { basename, extname, join, normalize, resolve } from "node:path";
import * as esbuild from "esbuild";
import { loadCatalog } from "../src/server/catalog.ts";
import { bundleOptions } from "./bundle.ts";

const PUBLIC = resolve("public");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
};
const RELOAD = `<script>new EventSource("/__reload").onmessage = () => location.reload();</script>`;

export async function startServer(port: number, live: boolean): Promise<Server> {
  const ctx = await esbuild.context({ ...bundleOptions, write: false, sourcemap: "inline" });
  let bundle: Map<string, Uint8Array> | null = null;
  const clients = new Set<ServerResponse>();

  const getBundle = async () => {
    if (!bundle) {
      const result = await ctx.rebuild();
      bundle = new Map(result.outputFiles!.map((f) => [basename(f.path), f.contents]));
    }
    return bundle;
  };

  let timer: NodeJS.Timeout | undefined;
  const changed = () => {
    bundle = null;
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const c of clients) c.write("data: reload\n\n");
    }, 150);
  };
  if (live) {
    watch("src", { recursive: true }, changed);
    watch("db", (_e, f) => f?.startsWith("esplain.db") && changed());
    if (existsSync(PUBLIC)) watch(PUBLIC, { recursive: true }, changed);
  }

  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    try {
      if (path === "/__reload") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (path === "/" || path === "/index.html") {
        const html = readFileSync("index.html", "utf8");
        res.writeHead(200, { "content-type": TYPES[".html"] });
        return res.end(live ? html.replace("</body>", `${RELOAD}</body>`) : html);
      }
      if (path === "/data/catalog.json") {
        res.writeHead(200, { "content-type": TYPES[".json"], "cache-control": "no-cache" });
        return res.end(JSON.stringify(await loadCatalog()));
      }
      const built = (await getBundle()).get(path.slice(1));
      if (built) {
        res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
        return res.end(built);
      }
      const file = normalize(join(PUBLIC, path));
      if (file.startsWith(PUBLIC) && existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
        return createReadStream(file).pipe(res);
      }
      res.writeHead(404).end("Not found");
    } catch (e) {
      console.error(e);
      res.writeHead(500, { "content-type": "text/plain" }).end(String(e));
    }
  });
  server.on("close", () => {
    for (const c of clients) c.end();
    void ctx.dispose();
  });
  await new Promise<void>((ok) => server.listen(port, ok));
  return server;
}

// Screenshots of a device as the app renders it, to check a model by eye.
//   npm run shot -- <slug> [--part KEY] [--views angle,top,bottom]
// Writes shots/<slug>-<view>.png and shots/<slug>-page.png.
// Uses Chrome from CHROME_PATH, else an installed Google Chrome.
import { mkdirSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright-core";
import { startServer } from "./server.ts";

const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const slug = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!slug) {
  console.error("usage: npm run shot -- <slug> [--part KEY] [--views angle,top,bottom]");
  process.exit(1);
}
const part = opt("--part");
const views = (opt("--views") ?? "angle,top,bottom").split(",");

const server = await startServer(0, false);
const port = (server.address() as AddressInfo).port;
const flags = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
let browser: Browser;
try {
  browser = process.env.CHROME_PATH
    ? await chromium.launch({ executablePath: process.env.CHROME_PATH, args: flags })
    : await chromium.launch({ channel: "chrome", args: flags });
} catch (e) {
  server.close();
  console.error(`Could not start Chrome. Set CHROME_PATH to a Chrome/Chromium binary.\n${(e as Error).message}`);
  process.exit(1);
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/#/d/${slug}${part ? `/${encodeURIComponent(part)}` : ""}`);
  await page.waitForSelector(".viewer canvas");
  await page.waitForTimeout(1500);
  mkdirSync("shots", { recursive: true });
  for (const view of views) {
    await page.click(`[data-view="${view}"]`);
    await page.waitForTimeout(1200);
    await page.locator(".viewer").screenshot({ path: `shots/${slug}-${view}.png` });
    console.log(`shots/${slug}-${view}.png`);
  }
  await page.screenshot({ path: `shots/${slug}-page.png`, fullPage: true });
  console.log(`shots/${slug}-page.png`);
  if (errors.length) {
    console.error("Page errors:\n" + errors.join("\n"));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
}

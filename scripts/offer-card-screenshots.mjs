import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, normalize } from "node:path";

const root = process.cwd();
const types = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml" };
const server = createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    const file = resolve(root, "." + normalize(pathname));
    if (!file.startsWith(root)) throw new Error("invalid path");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("Not found"); }
});
await new Promise(resolve => server.listen(4173,"127.0.0.1",resolve));
const browser = await chromium.launch({ headless:true });
try {
  for (const width of [390,980,1280]) {
    const page = await browser.newPage({ viewport:{ width, height:900 }, deviceScaleFactor:1 });
    await page.goto("http://127.0.0.1:4173/integration-classes.html", { waitUntil:"networkidle", timeout:60000 }).catch(()=>{});
    await page.waitForTimeout(2500);
    await page.screenshot({ path:`artifacts/trouve-ta-classe-${width}px.png`, fullPage:true });
    const result = await page.evaluate(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
      desktopLayout: document.documentElement.classList.contains("mf-wide"),
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      cardCount: document.querySelectorAll(".mf-card:not(.mf-skel)").length,
      rendererLoaded: !!window.MFOfferCards
    }));
    const expectedDesktop = width >= 928;
    console.log(JSON.stringify({ width, expectedDesktop, ...result }));
    if (!result.rendererLoaded || result.horizontalOverflow || result.desktopLayout !== expectedDesktop || result.rootFontSize !== "16px") process.exitCode = 1;
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

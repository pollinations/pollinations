import { readFile, writeFile } from "node:fs/promises";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { build } from "esbuild";
import { chromium } from "playwright";

const MAX_AXIS_PIXELS = 16_384;
const MAX_TOTAL_PIXELS = 64_000_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGES = 10;
const MIN_TILE_HEIGHT = 128;

const [input, outputPrefix, metadataPath, widthArg, heightArg] = process.argv.slice(2);
if (!input || !outputPrefix || !metadataPath || !widthArg || !heightArg) {
  throw new Error("Expected input, output prefix, metadata, width, and height.");
}
const viewport = { width: Number(widthArg), height: Number(heightArg) };
if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height)) {
  throw new Error("Viewport dimensions must be integers.");
}

const source = await readFile(input, "utf8");
if (source.length > 20_000 || !source.includes("function Visual")) {
  throw new Error("Invalid visual source.");
}
const forbidden = /\b(import|export|require|fetch|XMLHttpRequest)\b|<\/?(?:script|iframe|form)\b|javascript:/i;
if (forbidden.test(source)) throw new Error("Visual source contains a disallowed capability.");

const runtime = await readFile(new URL("../src/integrations/visual_studio_runtime.jsx", import.meta.url), "utf8");
const bundle = await build({
  stdin: {
    contents: `${runtime}\n${source}\ncreateRoot(document.getElementById("root")).render(<Visual />);`,
    loader: "jsx",
    resolveDir: "/app",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  write: false,
});
const cssInput = `@import "tailwindcss" source(none);\n@source ${JSON.stringify(input)};`;
const css = (await postcss([tailwindcss({ base: "/app" })]).process(cssInput, { from: "/app/visual.css" })).css;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"><style>html,body{margin:0;min-height:100%;}${css}</style></head><body><div id="root"></div></body></html>`;

const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
try {
  const context = await browser.newContext({ viewport });
  try {
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (pageErrors.length) throw new Error(`Visual page error: ${pageErrors[0]}`);

    const content = await page.evaluate(() => {
      const root = document.getElementById("root");
      if (!root) return null;
      const rect = root.getBoundingClientRect();
      if (root.childElementCount === 0 || rect.height <= 0) return null;
      return {
        width: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, rect.right)),
        height: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, rect.bottom)),
      };
    });
    if (!content) throw new Error("Visual root is blank.");
    if (content.width > MAX_AXIS_PIXELS || content.height > MAX_AXIS_PIXELS) {
      throw new Error(
        `Visual content is ${content.width}x${content.height}; each axis is limited to ${MAX_AXIS_PIXELS}px.`,
      );
    }
    if (content.width * content.height > MAX_TOTAL_PIXELS) {
      throw new Error(
        `Visual content is ${content.width}x${content.height} (${content.width * content.height} pixels); limit is ${MAX_TOTAL_PIXELS} pixels.`,
      );
    }

    const cdp = await context.newCDPSession(page);
    const pending = [{ y: 0, height: content.height }];
    const images = [];
    while (pending.length) {
      if (images.length + pending.length > MAX_IMAGES) {
        throw new Error(`Visual requires more than ${MAX_IMAGES} images to stay below the 20 MiB attachment limit.`);
      }
      const tile = pending.shift();
      const screenshot = Buffer.from(
        (
          await cdp.send("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: true,
            clip: { x: 0, y: tile.y, width: content.width, height: tile.height, scale: 1 },
          })
        ).data,
        "base64",
      );
      if (screenshot.byteLength > MAX_IMAGE_BYTES) {
        if (tile.height < MIN_TILE_HEIGHT * 2) {
          throw new Error("A visual tile exceeds Discord's 20 MiB attachment limit at minimum readable height.");
        }
        const topHeight = Math.floor(tile.height / 2);
        pending.unshift(
          { y: tile.y, height: topHeight },
          { y: tile.y + topHeight, height: tile.height - topHeight },
        );
        continue;
      }
      const path = `${outputPrefix}-${images.length + 1}.png`;
      await writeFile(path, screenshot);
      images.push({
        path,
        width: content.width,
        height: tile.height,
        y: tile.y,
        bytes: screenshot.byteLength,
      });
    }
    await writeFile(metadataPath, JSON.stringify({ viewport, content, fullPage: true, images }), "utf8");
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}

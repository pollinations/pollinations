#!/usr/bin/env node
/**
 * Generate frontend/public/checkout/pollen-pack-wide.png by reusing the OG
 * recipe from @pollinations/icons with a transparent background, so the
 * Stripe Checkout header band shows the brand color through.
 *
 * Usage:
 *   node enter.pollinations.ai/scripts/generate-checkout-image.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderOg } from "../../tools/icons/src/render.js";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

const UI_ROOT = dirname(require.resolve("@pollinations/ui/package.json"));
const uiAsset = (file) => readFile(join(UI_ROOT, "src/assets", file), "utf8");

const palette = JSON.parse(
    await readFile(join(UI_ROOT, "src/theme-palette.json"), "utf8"),
);
const CONTRAST_COLOR = palette.brandDark;

const [logo, text] = await Promise.all([
    uiAsset("logo.svg"),
    uiAsset("logo-text.svg"),
]);

const png = await renderOg(logo, text, {
    bg: null,
    logoColor: CONTRAST_COLOR,
});

const out = join(HERE, "../frontend/public/checkout/pollen-pack-wide.png");
await writeFile(out, png);
console.log(`wrote ${out} (${png.byteLength} bytes)`);

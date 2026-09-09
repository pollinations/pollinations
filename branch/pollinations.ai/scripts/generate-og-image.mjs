#!/usr/bin/env node
/**
 * generate-og-image.mjs
 *
 * Converts the source artwork into a web-ready OG image (1200×630).
 *
 * Strategy:
 *   - Cover-crop to exact OG dimensions — the source (5696×3008, ratio ~1.894)
 *     is nearly identical to OG ratio (1.905), so the crop is ~6px vertical trim.
 *   - Nearest-neighbor kernel preserves pixel-art crispness (no blur).
 *   - Output as PNG with aggressive oxipng-style compression via Sharp's
 *     compressionLevel 9 + effort 10, keeping file size minimal.
 *
 * Usage:
 *   node pollinations.ai/scripts/generate-og-image.mjs
 *
 * Options (edit constants below to tweak without touching logic):
 */

import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Tunable constants ---
const SOURCE = path.resolve(
  __dirname,
  "../public/Generated Image March 07, 2026 - 7_39PM.png"
);
const OUTPUT = path.resolve(__dirname, "../public/og-image.png");

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// "cover" centers the image and trims edges to fit exactly.
// Change to "contain" + background color if you want letterboxing instead.
const FIT = "cover";
const POSITION = "center";

// Nearest-neighbor keeps pixel art sharp. Use "lanczos3" for photographic sources.
const KERNEL = sharp.kernel.nearest;

// PNG compression: 0 (fast/large) – 9 (slow/small). 9 = smallest file.
const COMPRESSION_LEVEL = 9;
// ---

async function main() {
  const meta = await sharp(SOURCE).metadata();
  console.log(`Source: ${meta.width}×${meta.height} (${meta.format})`);

  await sharp(SOURCE)
    .resize(OG_WIDTH, OG_HEIGHT, {
      fit: FIT,
      position: POSITION,
      kernel: KERNEL,
    })
    .png({
      compressionLevel: COMPRESSION_LEVEL,
      palette: false, // keep full color depth
    })
    .toFile(OUTPUT);

  const { default: fs } = await import("fs");
  const bytes = fs.statSync(OUTPUT).size;
  console.log(
    `Output: ${OUTPUT} — ${OG_WIDTH}×${OG_HEIGHT}, ${(bytes / 1024).toFixed(1)} KB`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

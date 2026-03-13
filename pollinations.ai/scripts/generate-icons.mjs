#!/usr/bin/env node
/**
 * generate-icons.mjs
 *
 * Regenerates all favicon and PWA icons from src/ui/assets/logo.svg.
 *
 * - Favicons (16, 32): transparent background, dark logo
 * - PWA icons (192, 512): transparent background, dark logo
 * - Apple touch icons (180, 152, 167): white background (iOS ignores transparency)
 * - favicon.ico: multi-size (16+32) via manual ICO assembly
 *
 * Usage: node pollinations.ai/scripts/generate-icons.mjs
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src/ui/assets/logo.svg");
const OUT = path.resolve(__dirname, "../public");

// Logo color — matches the dark theme token used in the Logo component
const LOGO_COLOR = "#1a1a1a";

// Padding as fraction of canvas size (logo occupies 1 - 2*PADDING of the canvas)
const PADDING = 0.1;

async function renderIcon(size, { bg = null, color = LOGO_COLOR } = {}) {
    const innerSize = Math.round(size * (1 - 2 * PADDING));

    // Render SVG to PNG at inner size, colorized
    const svgBuffer = await sharp(SRC)
        .resize(innerSize, innerSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        // Tint: flatten to greyscale then colorize
        .flatten({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

    // Re-render: sharp can't tint directly, so we use the SVG with currentColor
    // Instead render at full size with padding via extend
    const pad = Math.round(size * PADDING);
    let pipeline = sharp(SRC)
        .resize(innerSize, innerSize, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .extend({
            top: pad,
            bottom: pad,
            left: pad,
            right: pad,
            background: bg
                ? hexToRgba(bg)
                : { r: 0, g: 0, b: 0, alpha: 0 },
        });

    if (bg) {
        pipeline = pipeline.flatten({ background: hexToRgba(bg) });
    }

    return pipeline.png().toBuffer();
}

function hexToRgba(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b, alpha: 1 };
}

// Minimal ICO writer: supports multiple PNG frames
function buildIco(pngBuffers) {
    const count = pngBuffers.length;
    const headerSize = 6;
    const dirEntrySize = 16;
    const dataOffset = headerSize + dirEntrySize * count;

    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: ICO
    header.writeUInt16LE(count, 4);

    let currentOffset = dataOffset;
    const dirEntries = [];
    for (const buf of pngBuffers) {
        // Read width/height from PNG IHDR (bytes 16-23)
        const w = buf.readUInt32BE(16);
        const h = buf.readUInt32BE(20);
        const entry = Buffer.alloc(dirEntrySize);
        entry.writeUInt8(w >= 256 ? 0 : w, 0);
        entry.writeUInt8(h >= 256 ? 0 : h, 1);
        entry.writeUInt8(0, 2); // color count
        entry.writeUInt8(0, 3); // reserved
        entry.writeUInt16LE(1, 4); // planes
        entry.writeUInt16LE(32, 6); // bit count
        entry.writeUInt32LE(buf.length, 8);
        entry.writeUInt32LE(currentOffset, 12);
        dirEntries.push(entry);
        currentOffset += buf.length;
    }

    return Buffer.concat([header, ...dirEntries, ...pngBuffers]);
}

async function main() {
    const icons = [
        // favicons — transparent
        { file: "favicon-16x16.png", size: 16 },
        { file: "favicon-32x32.png", size: 32 },
        // PWA icons — transparent
        { file: "icon-192.png", size: 192 },
        { file: "icon-512.png", size: 512 },
        // Apple touch — white background
        { file: "apple-touch-icon.png", size: 180, bg: "#ffffff" },
        { file: "apple-touch-icon-152x152.png", size: 152, bg: "#ffffff" },
        { file: "apple-touch-icon-167x167.png", size: 167, bg: "#ffffff" },
    ];

    for (const { file, size, bg } of icons) {
        const buf = await renderIcon(size, { bg });
        const dest = path.join(OUT, file);
        fs.writeFileSync(dest, buf);
        console.log(`${file} (${size}×${size}) — ${(buf.length / 1024).toFixed(1)} KB`);
    }

    // favicon.ico — 16 + 32 combined
    const [png16, png32] = await Promise.all([
        renderIcon(16),
        renderIcon(32),
    ]);
    const ico = buildIco([png16, png32]);
    fs.writeFileSync(path.join(OUT, "favicon.ico"), ico);
    console.log(`favicon.ico (16+32) — ${(ico.length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

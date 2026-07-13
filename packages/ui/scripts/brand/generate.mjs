#!/usr/bin/env node
// Brand asset generator — zero config.
//
//   npm run brand
//     → rebuilds the committed kit in src/brand (mark/wordmark/lockup, black+white)
//     → writes every favicon / PWA / apple-touch / maskable / OG / social asset
//       to brand-out/ (gitignored) — copy them into a site's public/
//
// Everything derives from three atomic sources: mark.svg + wordmark.svg
// (currentColor) and the raster bee polli.png. Colours are the two brand themes
// in presets.js, resolved from theme-palette.json — no per-run options. Recolour
// = swap currentColor; size + padding come from presets.js. No dynamic text.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRESETS } from "./presets.js";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const UI = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BRAND = join(UI, "src/brand");
const palette = JSON.parse(
    readFileSync(join(UI, "src/theme-palette.json"), "utf8"),
);
// Brand colours — the single source of truth is theme-palette.json.
const COLORS = {
    ink: palette.brandDark, // #110518  dark lotus
    cream: palette.bgPale.accent, // #fef8eb  pale field
    gold: palette.bgActive.accent, // #ffd76d  favicon accent
    white: "#ffffff",
};
// Two default front/background pairs, matching enter.pollinations.ai.
const THEMES = {
    mark: { fg: "gold", bg: "transparent" }, // favicons, app icons
    field: { fg: "ink", bg: "cream" }, // OG, apple-touch, social
};
// name or hex → hex, "transparent" → null
const color = (c) => (c === "transparent" ? null : (COLORS[c] ?? c));
const round = (n) => Math.round(n * 1000) / 1000;
const recolor = (svg, c) => svg.replaceAll("currentColor", c);
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const canvas = (w, h, background) =>
    sharp({
        create: {
            width: Math.round(w),
            height: Math.round(h),
            channels: 4,
            background,
        },
    });

// --- atomic sources ---
const markSvg = readFileSync(join(BRAND, "mark.svg"), "utf8");
const wordmarkSvg = readFileSync(join(BRAND, "wordmark.svg"), "utf8");
const beePng = await sharp(join(BRAND, "polli/polli.png"))
    .ensureAlpha()
    .trim({ threshold: 1 })
    .toBuffer();

// --- tight ink bbox (in svg user units): align by ink, not viewBox padding ---
function svgParts(svg) {
    const s = svg
        .replace(/<\?xml[\s\S]*?\?>/g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();
    const vb = s.match(/<svg\b[^>]*>/i)[0].match(/viewBox="([^"]+)"/i)[1];
    const inner = s
        .replace(/<svg\b[^>]*>/i, "")
        .replace(/<\/svg>\s*$/i, "")
        .trim();
    return { vb, inner };
}
async function tightBBox({ vb }, svg) {
    const [vx, vy, vw] = vb.split(/\s+/).map(Number);
    const RW = 1200;
    const scale = RW / vw;
    const png = await sharp(Buffer.from(recolor(svg, "#000")))
        .resize({ width: RW })
        .png()
        .toBuffer();
    const { info } = await sharp(png)
        .trim({ threshold: 1 })
        .toBuffer({ resolveWithObject: true });
    return [
        vx - (info.trimOffsetLeft || 0) / scale,
        vy - (info.trimOffsetTop || 0) / scale,
        info.width / scale,
        info.height / scale,
    ];
}
// place `inner` so its ink bbox maps to (x, y, width w) — flat <g transform>,
// robust to SVG optimizers (no fragile nested <svg>).
const place = (inner, bb, x, y, w) => {
    const s = w / bb[2];
    return `<g transform="translate(${round(x - bb[0] * s)} ${round(y - bb[1] * s)}) scale(${round(s)})">${inner}</g>`;
};

const markP = svgParts(markSvg);
const wordP = svgParts(wordmarkSvg);
const markBB = await tightBBox(markP, markSvg);
const wordBB = await tightBBox(wordP, wordmarkSvg);
const arMark = markBB[2] / markBB[3];
const arWord = wordBB[2] / wordBB[3];

// --- vector lockups (currentColor), composed by ink bounds ---
function lockupHorizontal() {
    const ht = 96;
    const wt = ht * arWord;
    const hm = ht * 1.15; // lotus ~ text height (compact)
    const wm = hm * arMark;
    const gap = ht * 0.12; // tight — mark + text read as one unit
    const pad = ht * 0.4;
    const H = Math.max(hm, ht) + pad * 2;
    const W = pad + wm + gap + wt + pad;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(W)} ${round(H)}" fill="currentColor">
  ${place(markP.inner, markBB, pad, (H - hm) / 2, wm)}
  ${place(wordP.inner, wordBB, pad + wm + gap, (H - ht) / 2, wt)}
</svg>`;
}
function lockupStacked() {
    const hm = 300;
    const wm = hm * arMark;
    const wt = hm * 2.0; // wordmark ~2x mark height wide (matches OG)
    const ht = wt / arWord;
    const gap = hm * 0.16;
    const pad = hm * 0.1;
    const W = Math.max(wm, wt) + pad * 2;
    const H = pad + hm + gap + ht + pad;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(W)} ${round(H)}" fill="currentColor">
  ${place(markP.inner, markBB, (W - wm) / 2, pad, wm)}
  ${place(wordP.inner, wordBB, (W - wt) / 2, pad + hm + gap, wt)}
</svg>`;
}
const VECTOR = {
    mark: markSvg,
    wordmark: wordmarkSvg,
    "lockup-horizontal": lockupHorizontal(),
    "lockup-stacked": lockupStacked(),
};

// --- raster Polli lockups (bee stays full-colour; ink recolours the wordmark) ---
const beeH = (await sharp(beePng).metadata()).height;
const beeAt = (h) =>
    sharp(beePng)
        .resize({ height: Math.round(h), kernel: "nearest" })
        .png()
        .toBuffer();
async function wordmarkRaster(ink, h) {
    const big = await sharp(Buffer.from(recolor(wordmarkSvg, ink)), {
        density: 2400,
    })
        .png()
        .toBuffer();
    const trimmed = await sharp(big).trim({ threshold: 1 }).toBuffer();
    return sharp(trimmed)
        .resize({ height: Math.round(h) })
        .png()
        .toBuffer();
}
async function beeRow(ink, textRatio, gapR, padR, stacked) {
    const bee = await beeAt(beeH);
    const bm = await sharp(bee).metadata();
    const text = await wordmarkRaster(ink, bm.height * textRatio);
    const tm = await sharp(text).metadata();
    const gap = Math.round(bm.height * gapR);
    const pad = Math.round(bm.height * padR);
    if (stacked) {
        const W = Math.max(bm.width, tm.width) + pad * 2;
        const H = pad + bm.height + gap + tm.height + pad;
        return canvas(W, H, transparent)
            .composite([
                { input: bee, left: Math.round((W - bm.width) / 2), top: pad },
                {
                    input: text,
                    left: Math.round((W - tm.width) / 2),
                    top: pad + bm.height + gap,
                },
            ])
            .png()
            .toBuffer();
    }
    const H = Math.max(bm.height, tm.height) + pad * 2;
    const W = pad + bm.width + gap + tm.width + pad;
    return canvas(W, H, transparent)
        .composite([
            { input: bee, left: pad, top: Math.round((H - bm.height) / 2) },
            {
                input: text,
                left: pad + bm.width + gap,
                top: Math.round((H - tm.height) / 2),
            },
        ])
        .png()
        .toBuffer();
}
const beeHorizontal = (ink) =>
    beeRow(ink, 1 / 1.5, 0.12 / 1.5, 0.35 / 1.5, false);
const beeStacked = (ink) => beeRow(ink, 0.34, 0.08, 0.08, true);

// --- content → source buffer (svg for vector, png for raster bee) ---
async function contentSource(name, ink) {
    if (name === "bee") return beePng;
    if (name === "bee-horizontal") return beeHorizontal(ink);
    if (name === "bee-stacked") return beeStacked(ink);
    return Buffer.from(recolor(VECTOR[name], ink));
}

// --- render one preset: fit content inside the padded box, centre on the canvas ---
// fg = front colour (hex); bg = background colour (hex) or null for transparent.
async function renderPreset(preset, fg, bg) {
    const pad = Math.round(Math.min(preset.w, preset.h) * preset.pad);
    const source = await contentSource(preset.content, fg);
    const content = await sharp(source)
        .resize({
            width: preset.w - pad * 2,
            height: preset.h - pad * 2,
            fit: "inside",
            background: transparent,
        })
        .png()
        .toBuffer();
    const cm = await sharp(content).metadata();
    return canvas(preset.w, preset.h, bg ?? transparent)
        .composite([
            {
                input: content,
                left: Math.round((preset.w - cm.width) / 2),
                top: Math.round((preset.h - cm.height) / 2),
            },
        ])
        .png()
        .toBuffer();
}

// --- committed kit: color-swapped SVG/PNG derivatives + the Polli lockups ---
async function buildKit() {
    const pngWidth = {
        mark: 512,
        wordmark: 1024,
        "lockup-horizontal": 1024,
        "lockup-stacked": 1024,
    };
    for (const [name, master] of Object.entries(VECTOR)) {
        const black = recolor(master, COLORS.ink);
        const white = recolor(master, COLORS.white);
        if (name.startsWith("lockup"))
            writeFileSync(join(BRAND, `${name}.svg`), `${master.trim()}\n`); // composed master
        writeFileSync(join(BRAND, `${name}-black.svg`), `${black.trim()}\n`);
        writeFileSync(join(BRAND, `${name}-white.svg`), `${white.trim()}\n`);
        writeFileSync(
            join(BRAND, `${name}-black.png`),
            await sharp(Buffer.from(black))
                .resize({ width: pngWidth[name] })
                .png()
                .toBuffer(),
        );
        writeFileSync(
            join(BRAND, `${name}-white.png`),
            await sharp(Buffer.from(white))
                .resize({ width: pngWidth[name] })
                .png()
                .toBuffer(),
        );
    }
    for (const [tone, ink] of [
        ["black", COLORS.ink],
        ["white", COLORS.white],
    ]) {
        writeFileSync(
            join(BRAND, `polli/polli-lockup-horizontal-${tone}.png`),
            await beeHorizontal(ink),
        );
        writeFileSync(
            join(BRAND, `polli/polli-lockup-stacked-${tone}.png`),
            await beeStacked(ink),
        );
    }
}

// --- run: rebuild the committed kit, then write every asset to brand-out/ ---
await buildKit();
const OUT = join(UI, "brand-out");
mkdirSync(OUT, { recursive: true });
const names = Object.keys(PRESETS);
for (const name of names) {
    const preset = PRESETS[name];
    const theme = THEMES[preset.theme];
    writeFileSync(
        join(OUT, `${name}.png`),
        await renderPreset(preset, color(theme.fg), color(theme.bg)),
    );
}
console.log(`brand kit → src/brand · ${names.length} assets → brand-out/`);

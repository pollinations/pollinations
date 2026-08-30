#!/usr/bin/env node
/**
 * Generates the cover art behind app cards — one unique image per app, drawn
 * from that app's own name and description.
 *
 *   POLLINATIONS_TOKEN=sk_... node scripts/generate-app-art.mjs
 *
 * Run by hand, not at build time and never per visitor. The output is
 * committed to public/app-art/ and served as a static file: anonymous
 * generation is no longer possible (the legacy prompt endpoint 403s, gen 401s,
 * and the site's publishable pk_ key can only start an authorize flow), and
 * generating on page load would cost seconds of latency and real Pollen for
 * decoration.
 *
 * Only the art *direction* comes from social/prompts/brand/visual.md — the
 * cozy 8-bit style, the lime/cream palette, the warm lighting. The recurring
 * cast does not: these are covers for other people's apps, so the subject is
 * always the app itself.
 *
 * Covers are generated for the apps that can actually reach an image slot: the
 * hand-picked spotlight, plus the top of the directory in the same order the
 * site sorts it (Hello's shelf and the Apps hero/strip all read from there).
 * An app with no cover renders without one, which is why the manifest exists.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "public", "app-art");
const MANIFEST = join(HERE, "..", "src", "ui", "apps", "covers.json");
const SPOTLIGHT_FILE = join(HERE, "..", "src", "data", "spotlight.json");

const MODEL = "nanobanana-2-lite";
const GEN = "https://gen.pollinations.ai/image";
const TINYBIRD = "https://api.europe-west2.gcp.tinybird.co/v0/pipes";
const PUBLIC_READ_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

/** How many of the directory's top apps get art, beyond the spotlight. */
const TOP_N = Number(process.env.APP_ART_TOP_N ?? 20);

/** Re-runs skip anything already drawn; APP_ART_FORCE=1 redraws everything. */
const FORCE = process.env.APP_ART_FORCE === "1";

/** Not in the directory, but it fills one of the two hero slots on /apps. */
const EXTRAS = [
    {
        name: "Pollinations Playground",
        description:
            "Every model in the browser — text, image, audio and video generated from a single page",
    },
];

/**
 * The style half of social/prompts/brand/visual.md, with the cast removed.
 * Everything that makes one cover different from another comes from the app.
 */
const STYLE =
    "Cozy 8-bit pixel art illustration, chunky retro sprites with large visible pixels. " +
    "Soft lime green (#ecf874) and warm cream pastel gradient background, lime green clearly " +
    "present. Warm ambient lighting, soft pastel highlights, lo-fi wholesome vibes like " +
    "Stardew Valley or A Short Hike. No text, no words, no letters, no logos, no user " +
    "interface chrome. Nostalgic but beautiful, emotionally warm.";

/** Stable filename per app, and the key the site looks up. */
export function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
}

/** Deterministic seed from the name, so re-running reproduces the same art. */
function seedOf(name) {
    let value = 2166136261;
    for (let i = 0; i < name.length; i++) {
        value ^= name.charCodeAt(i);
        value = Math.imul(value, 16777619);
    }
    return (value >>> 0) % 100000;
}

async function directory() {
    const response = await fetch(
        `${TINYBIRD}/app_directory_public.json?token=${PUBLIC_READ_TOKEN}&limit=1000`,
    );
    if (!response.ok) throw new Error(`directory: ${response.status}`);
    const { data = [] } = await response.json();
    const seen = new Set();
    return data.filter((app) => {
        const key = app.name?.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Mirrors sortApps in src/data/publicStats.ts. */
const stars = (raw) => {
    const m = raw?.match(/([\d.]+)\s*([kK])?/);
    return m ? Number.parseFloat(m[1]) * (m[2] ? 1000 : 1) : 0;
};
const isBuzz = (app) => Number(app.requests_24h) >= 100;
const isPollen = (app) =>
    app.byop === true || app.byop === 1 || app.byop === "true";
const sortApps = (a, b) =>
    Number(isBuzz(b)) - Number(isBuzz(a)) ||
    Number(isPollen(b)) - Number(isPollen(a)) ||
    stars(b.github_repository_stars) - stars(a.github_repository_stars) ||
    (b.approved_date || "").localeCompare(a.approved_date || "");

async function generate(app, token) {
    // The app is the whole subject. Its description is what the maintainers
    // wrote in APPS.md, so the scene is always specific to that app.
    const subject = app.description
        ? `${app.name} — ${app.description}`
        : app.name;
    const prompt =
        `A cozy pixel art scene illustrating this app: ${subject}. ` +
        `Show the idea as a small illustrated scene, not a screenshot. ${STYLE}`;

    const url =
        `${GEN}/${encodeURIComponent(prompt)}` +
        `?model=${MODEL}&width=1024&height=512&nologo=true&seed=${seedOf(app.name)}`;

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(
            `${response.status} ${(await response.text()).slice(0, 140)}`,
        );
    }

    const slug = slugify(app.name);
    // .jpg, not .raw — ImageMagick reads a .raw extension as camera RAW/DNG
    // and refuses the file whatever its actual contents.
    const src = join(OUT_DIR, `${slug}.src.jpg`);
    await writeFile(src, Buffer.from(await response.arrayBuffer()));

    // Crop to the 2:1 the cards display, then downscale. Straight from the
    // model each file is ~200 KB; this lands near 45 KB with no visible loss
    // on flat pixel art.
    await run("magick", [
        src,
        "-gravity",
        "center",
        "-crop",
        "2:1",
        "+repage",
        "-resize",
        "1200x600",
        "-quality",
        "82",
        "-define",
        "webp:method=6",
        join(OUT_DIR, `${slug}.webp`),
    ]);
    await run("rm", [src]);
    return slug;
}

const token = process.env.POLLINATIONS_TOKEN;
if (!token) {
    console.error(
        "POLLINATIONS_TOKEN is required (an sk_ key with paid balance)",
    );
    process.exit(1);
}

const spotlight = JSON.parse(await readFile(SPOTLIGHT_FILE, "utf8"));
const apps = await directory();
const byName = new Map(apps.map((app) => [app.name.toLowerCase(), app]));

// Spotlight first, then the top of the directory — deduplicated by name.
const wanted = [];
const taken = new Set();
for (const name of spotlight) {
    const app = byName.get(name.toLowerCase());
    if (app && !taken.has(app.name)) {
        taken.add(app.name);
        wanted.push(app);
    } else if (!app) {
        console.log(`  (spotlight miss: "${name}" is not in the directory)`);
    }
}
for (const app of apps.slice().sort(sortApps)) {
    if (wanted.length >= spotlight.length + TOP_N) break;
    if (taken.has(app.name) || !app.description) continue;
    taken.add(app.name);
    wanted.push(app);
}
for (const extra of EXTRAS) {
    if (!taken.has(extra.name)) wanted.push(extra);
}

console.log(`${wanted.length} apps, drawing with ${MODEL}\n`);
await mkdir(OUT_DIR, { recursive: true });

const manifest = {};
for (const [index, app] of wanted.entries()) {
    const slug = slugify(app.name);
    const label = `${String(index + 1).padStart(2)}/${wanted.length}  ${app.name.slice(0, 44).padEnd(46)}`;

    if (!FORCE && existsSync(join(OUT_DIR, `${slug}.webp`))) {
        console.log(`${label}skipped (already drawn)`);
        manifest[slug] = slug;
        continue;
    }

    process.stdout.write(label);
    try {
        manifest[slug] = await generate(app, token);
        console.log("ok");
    } catch (error) {
        console.log(`FAILED — ${error.message}`);
    }
}

// Slug -> slug, so the site can ask "is there art for this app?" without
// shipping the directory or probing for 404s.
await writeFile(
    MANIFEST,
    `${JSON.stringify(Object.keys(manifest).sort(), null, 4)}\n`,
);
console.log(`\nmanifest: ${Object.keys(manifest).length} covers`);

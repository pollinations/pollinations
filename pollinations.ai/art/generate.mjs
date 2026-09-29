#!/usr/bin/env node
/**
 * Draws the website illustrations from recipe.json into art/out/.
 *
 *   POLLINATIONS_TOKEN=sk_... npm run art
 *
 * Every recipe image missing from out/ is drawn: the day version from its
 * prompt with the character sheet attached, then each other light as an edit
 * of that day image, so a pair keeps one composition. Each file is written
 * 2048 and 1024 px wide. Pages run in parallel.
 *
 * To redraw an image, delete it from out/ and run again (change its seed or
 * prompt for a different result: an identical request returns the cached one).
 *
 * The website never reads out/. Copy the images you keep:
 *   cp art/out/*.webp public/art/
 *
 * Needs ImageMagick (`magick`) and a key with paid balance.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ART = dirname(fileURLToPath(import.meta.url));
const OUT = join(ART, "out");
const token = process.env.POLLINATIONS_TOKEN;
if (!token) {
    console.error("usage: POLLINATIONS_TOKEN=sk_... npm run art");
    process.exit(1);
}
const recipe = JSON.parse(readFileSync(join(ART, "recipe.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

/** A ref with a "/" is a file in art/ (refs/…); otherwise it names a drawn image. */
const file = (ref, light = "day") =>
    ref.includes("/") ? join(ART, ref) : join(OUT, `${ref}-${light}.webp`);
const fillCast = (text) =>
    text.replace(/\{(\w+)\}/g, (match, name) => recipe.cast[name] ?? match);
const dataUri = (path) =>
    `data:image/${path.endsWith(".webp") ? "webp" : "jpeg"};base64,${readFileSync(path).toString("base64")}`;

async function draw(image, lightName) {
    const name = `${image.page}-${image.slot}-${lightName}`;
    const out = file(`${image.page}-${image.slot}`, lightName);
    if (existsSync(out)) return;

    const light = recipe.lights[lightName];
    // An image may override its page world's lines, e.g. a placeholder with no scenery.
    const world = { ...recipe.worlds[image.page], ...image.world };
    const frame = recipe.frames[image.frame];
    const refs = light.from
        ? [file(`${image.page}-${image.slot}`, light.from), file(recipe.sheet)]
        : [file(recipe.sheet), ...(image.refs ?? []).map((ref) => file(ref))];
    const missing = refs.find((path) => !existsSync(path));
    if (missing) return console.log(`${name}: skipped, needs ${missing}`);
    const lines = light.from
        ? [light.prompt, world[lightName]]
        : [recipe.style, frame.prompt, world.look, light.prompt, image.prompt];

    const response = await fetch(
        "https://gen.pollinations.ai/v1/images/edits",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: recipe.model,
                prompt: fillCast(lines.filter(Boolean).join("\n\n")),
                image: refs.map((path) => ({ image_url: dataUri(path) })),
                size: frame.request,
                seed: image.seed,
                response_format: "b64_json",
            }),
        },
    );
    if (!response.ok) {
        const reason = (await response.text()).slice(0, 300);
        return console.log(`${name}: ${response.status} ${reason}`);
    }
    const drawn = Buffer.from(
        (await response.json()).data[0].b64_json,
        "base64",
    );

    // Fill the frame's served size, cropping the model's nearest aspect ratio.
    const [width, height] = frame.size.split("x").map(Number);
    for (const w of [width, 1024]) {
        const size = `${w}x${Math.round((w * height) / width)}`;
        const path = w === width ? out : out.replace(/\.webp$/, "-1024.webp");
        execFileSync(
            "magick",
            [
                "-",
                "-resize",
                `${size}^`,
                "-gravity",
                frame.gravity,
                "-extent",
                size,
                "-quality",
                "85",
                "-define",
                "webp:method=6",
                path,
            ],
            { input: drawn },
        );
    }
    console.log(`drew ${name}.webp`);
}

// Pages run in parallel. Within a page, images go in recipe order (a hero
// before the slots that reference it), and every day before its night.
const pages = [...new Set(recipe.images.map((image) => image.page))];
await Promise.all(
    pages.map(async (page) => {
        const images = recipe.images.filter((image) => image.page === page);
        for (const lightName of Object.keys(recipe.lights)) {
            for (const image of images) await draw(image, lightName);
        }
    }),
);

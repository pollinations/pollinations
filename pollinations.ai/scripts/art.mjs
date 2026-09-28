#!/usr/bin/env node
/**
 * Draws the site illustrations from a set recipe.
 *
 *   POLLINATIONS_TOKEN=sk_... node scripts/art.mjs <set> [filter] [--light night] [--force]
 *
 * A set is a folder in public/art/: set.json holds every prompt, and the
 * images sit beside it as <page>-<slot>-<light>.webp plus a -1024 copy.
 * ART_SET in src/art-config.ts picks the live set; day shows in light mode, night in
 * dark mode.
 *
 * Day images are drawn from their prompt with the character sheet attached.
 * Every other light is an edit of the approved day image, so the pair keeps
 * one composition. Existing files are skipped unless --force. The filter
 * matches "page/slot", e.g. "hero", "play/" or "apps/placeholder".
 *
 * Nothing is approved automatically: look at each image, change its seed or
 * prompt and rerun with --force, and commit the files you keep.
 *
 * New set: copy a set folder, edit set.json, delete the images to redraw, run
 * the day images, review them side by side, run --light night, switch ART_SET.
 * Needs ImageMagick (`magick`) and a key with paid balance.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(SITE, "..");

const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        light: { type: "string", default: "day" },
        force: { type: "boolean", default: false },
    },
});
const [setName, filter = ""] = positionals;
const token = process.env.POLLINATIONS_TOKEN;
if (!setName || !token) {
    console.error(
        "usage: POLLINATIONS_TOKEN=sk_... node scripts/art.mjs <set> [filter] [--light night] [--force]",
    );
    process.exit(1);
}

const dir = join(SITE, "public/art", setName);
const set = JSON.parse(readFileSync(join(dir, "set.json"), "utf8"));
const light = set.lights[args.light];
if (!light) throw new Error(`set.json has no light "${args.light}"`);

/** A ref is an image of this set ("page-slot") or a path from the repo root. */
const file = (ref, lightName = "day") =>
    ref.includes("/") ? join(REPO, ref) : join(dir, `${ref}-${lightName}.webp`);
const fillCast = (text) =>
    text.replace(/\{(\w+)\}/g, (match, name) => set.cast[name] ?? match);
const dataUri = (path) =>
    `data:image/${path.endsWith(".webp") ? "webp" : "jpeg"};base64,${readFileSync(path).toString("base64")}`;

for (const image of set.images) {
    const name = `${image.page}-${image.slot}`;
    const out = file(name, args.light);
    if (!`${image.page}/${image.slot}`.includes(filter)) continue;
    if (existsSync(out) && !args.force) continue;

    // An image may override its page world's lines, e.g. a placeholder with no scenery.
    const world = { ...set.worlds[image.page], ...image.world };
    const frame = set.frames[image.frame];
    const refs = light.from
        ? [file(name, light.from), join(REPO, set.sheet)]
        : [
              join(REPO, set.sheet),
              ...(image.refs ?? []).map((ref) => file(ref)),
          ];
    const missing = refs.find((path) => !existsSync(path));
    if (missing) {
        console.log(`${name}: make ${missing} first`);
        continue;
    }
    const lines = light.from
        ? [light.prompt, world[args.light]]
        : [set.style, frame.prompt, world.look, light.prompt, image.prompt];

    const response = await fetch(
        "https://gen.pollinations.ai/v1/images/edits",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: set.model,
                prompt: fillCast(lines.filter(Boolean).join("\n\n")),
                image: refs.map((path) => ({ image_url: dataUri(path) })),
                size: frame.request,
                seed: image.seed,
                response_format: "b64_json",
            }),
        },
    );
    if (!response.ok) {
        console.log(
            `${name}: ${response.status} ${(await response.text()).slice(0, 300)}`,
        );
        continue;
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
    console.log(`drew ${name}-${args.light}.webp`);
}

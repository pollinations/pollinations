#!/usr/bin/env node
/**
 * Draws the cast sprites that sit beside each page's hero.
 *
 *   POLLINATIONS_TOKEN=sk_... node scripts/generate-characters.mjs
 *
 * Characters only, on transparent backgrounds — not scenes. Each one is doing
 * something that belongs to its page, with an accessory to match, exactly like
 * the bee already on Hello (packages/ui/src/brand/polli/polli.png), which is
 * the reference these have to sit beside.
 *
 * Cast and look come from social/prompts/brand/visual.md and bee.md: Polli,
 * the monitor robot and the nomnom, in chunky pixel art with a thick black
 * outline and flat colour.
 *
 * TRANSPARENCY: the API's `transparent=true` only works on gptimage, which
 * returns JPEG here anyway — no alpha either way. So each sprite is drawn on
 * flat magenta and keyed out: floodfill from the corners (so magenta *inside*
 * the character would survive, though none is used), then a hard alpha
 * threshold, because JPEG leaves a halo that a soft alpha turns into a fringe.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "public", "characters");

const MODEL = "nanobanana-2-lite";
const GEN = "https://gen.pollinations.ai/image";
const FORCE = process.env.CHARACTERS_FORCE === "1";

/** Verbatim from social/prompts/brand/bee.md. */
const BEE =
    "a cute bee mascot with a round yellow body and dark brown horizontal stripes, " +
    "small black legs, two black antennae, black vertical oval eyes, bright pink " +
    "rectangular blush marks on her cheeks, a small happy smile and small rounded " +
    "light blue translucent wings";

/** From the recurring-cast section of visual.md. */
const ROBOT =
    "a cute chunky robot with a CRT monitor for a head, a small boxy body and stubby " +
    "mechanical arms, with expressive square pixel eyes on its screen looking curious " +
    "and delighted";

const NOMNOM =
    "a round friendly tan-brown spherical creature like a pixel mochi ball, with tiny " +
    "dot eyes, rosy cheeks and a wide happy open mouth";

/** The sprite rules — what makes these cut-outs rather than illustrations. */
const SPRITE =
    "Chunky 8-bit pixel art sprite art, thick black pixel outline around every character, " +
    "flat solid colours, large visible chunky pixels, no anti-aliasing, no gradients. " +
    "Full body, centred, facing the viewer. No scene, no floor, no shadow, no props " +
    "except the ones described, no text, no words, no letters. " +
    "The entire background is one completely flat uniform pure magenta (#FF00FF), " +
    "edge to edge, absolutely nothing else in the image.";

/**
 * One per page. Hello keeps the existing bee, so she is not redrawn here —
 * these are the three that were missing.
 */
const CAST = {
    play: {
        seed: 3101,
        square: true,
        prompt:
            `${ROBOT}. It is holding up a small pixel picture frame showing a tiny ` +
            `freshly generated landscape in one hand, and a tiny paintbrush in the ` +
            `other, presenting it proudly. A single character alone.`,
    },
    apps: {
        seed: 3102,
        square: true,
        prompt:
            `${NOMNOM}. It is cheerfully balancing a tall wobbling stack of small ` +
            `colourful pixel app windows on its head and holding one more in front ` +
            `of it, delighted with the pile. A single character alone.`,
    },
    community: {
        seed: 3103,
        square: false,
        prompt:
            `Three characters standing together in a row, as a group portrait: ` +
            `on the left ${BEE}, wearing a tiny party hat and waving hello; ` +
            `in the middle ${ROBOT}, holding a small pixel heart up in its arms; ` +
            `on the right ${NOMNOM}, wearing a tiny knitted scarf and beaming. ` +
            `All three are the same illustration style and roughly the same height, ` +
            `standing side by side, close together, celebrating.`,
    },
};

async function draw(name, spec, token) {
    const width = spec.square ? 1024 : 1408;
    const height = 1024;
    const prompt = `${spec.prompt} ${SPRITE}`;
    const url =
        `${GEN}/${encodeURIComponent(prompt)}` +
        `?model=${MODEL}&width=${width}&height=${height}&nologo=true&seed=${spec.seed}`;

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(
            `${response.status} ${(await response.text()).slice(0, 140)}`,
        );
    }

    const src = join(OUT_DIR, `${name}.src.jpg`);
    await writeFile(src, Buffer.from(await response.arrayBuffer()));

    // Read the real size back — the model picks its own aspect and ignoring
    // that would floodfill from corners that are not corners.
    const { stdout } = await run("magick", [
        "identify",
        "-format",
        "%w %h",
        src,
    ]);
    const [w, h] = stdout.trim().split(" ").map(Number);

    const out = join(OUT_DIR, `${name}.png`);
    await run("magick", [
        src,
        "-alpha",
        "set",
        "-fuzz",
        "30%",
        "-fill",
        "none",
        "-draw",
        "color 0,0 floodfill",
        "-draw",
        `color ${w - 1},0 floodfill`,
        "-draw",
        `color 0,${h - 1} floodfill`,
        "-draw",
        `color ${w - 1},${h - 1} floodfill`,
        // Hard alpha: JPEG's halo becomes a visible fringe if left partial.
        "-channel",
        "A",
        "-threshold",
        "50%",
        "+channel",
        "-trim",
        "+repage",
        // Comfortably 2x the largest on-page size (340px hero, 520px trio).
        "-resize",
        "x760>",
        // A 256-colour palette is indistinguishable on flat pixel art and
        // takes each sprite from ~220 KB to ~65 KB. Safe because the alpha is
        // already binary, which is all PNG8 can carry.
        "-colors",
        "256",
        "-define",
        "png:compression-level=9",
        `PNG8:${out}`,
    ]);
    await unlink(src);

    const { stdout: info } = await run("magick", [
        "identify",
        "-format",
        "%wx%h",
        out,
    ]);
    return info.trim();
}

const token = process.env.POLLINATIONS_TOKEN;
if (!token) {
    console.error(
        "POLLINATIONS_TOKEN is required (an sk_ key with paid balance)",
    );
    process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
for (const [name, spec] of Object.entries(CAST)) {
    process.stdout.write(`${name.padEnd(12)}`);
    if (!FORCE && existsSync(join(OUT_DIR, `${name}.png`))) {
        console.log("skipped (already drawn)");
        continue;
    }
    try {
        console.log(await draw(name, spec, token));
    } catch (error) {
        console.log(`FAILED — ${error.message}`);
    }
}

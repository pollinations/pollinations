#!/usr/bin/env node
/**
 * Generates the four hero background scenes — one quiet, wide, painted place
 * per page, with that page's character(s) small in the right third, dissolving
 * at the bottom into the sheet cream (#fef8eb).
 *
 *   POLLINATIONS_TOKEN=sk_... node scripts/generate-hero-scenes.mjs
 *   HERO_PAGES=home,apps   regenerate a subset
 *   HERO_FORCE=1           redraw even if the file exists
 *
 * Run by hand, committed to public/heroes/, served static. A backend that
 * keeps regenerating these is a later idea — the media cache makes that cheap
 * (cached URLs serve without auth) — but for now the art is a fixed, reviewed
 * asset like the app covers.
 *
 * nanobanana-2 (not lite): the scenes carry the whole hero, so they get the
 * strongest model. Requested at 2048x1152, which the Vertex client maps to the
 * 2K 16:9 tier; post-cropped to a wide banner keeping the ground, and encoded
 * webp.
 *
 * The bottom dissolve is done twice, on purpose. The prompt asks the scene to
 * melt into flat #fef8eb at its bottom edge, so the fade looks painted; and
 * the site still applies a CSS alpha mask over the same zone, because the
 * model will never hit the exact hex and a near-miss cream reads as a dirty
 * seam against the real sheet.
 *
 * Cast and style come from social/prompts/brand/visual.md and bee.md, so the
 * painted characters match the brand's canonical descriptions.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "public", "heroes");

const MODEL = "nanobanana-2";
const GEN = "https://gen.pollinations.ai/image";
const FORCE = process.env.HERO_FORCE === "1";
const ONLY = process.env.HERO_PAGES?.split(",").map((s) => s.trim());

/** The sheet colour the scene must dissolve into — bg-pale at hue 85. */
const CREAM = "#fef8eb";

/** Verbatim from social/prompts/brand/bee.md. */
const BEE =
    "a cute pixel art bee mascot with a round yellow body and dark brown horizontal " +
    "stripes, small black legs, two black antennae, black vertical oval eyes, bright " +
    "pink rectangular blush marks on her cheeks, a small happy smile and small rounded " +
    "light blue translucent wings";

/** From the recurring-cast section of visual.md. */
const ROBOT =
    "a cute chunky pixel robot with a CRT monitor for a head, expressive square pixel " +
    "eyes on its screen, a small boxy body and stubby mechanical arms";

const NOMNOM =
    "a round friendly tan-brown spherical creature like a pixel mochi ball, with tiny " +
    "dot eyes, rosy cheeks and a wide happy mouth";

/**
 * The composition rules every scene shares. Two zones: the left two-thirds is
 * the text's ground, so it must stay near-empty and very pale; the character
 * lives small in the right third; the bottom melts into the sheet cream.
 */
const FRAME =
    "Wide panoramic cozy 8-bit pixel art scene, chunky retro sprites, large visible " +
    "pixels. The upper and left two thirds of the image are a vast, calm, nearly empty " +
    `very pale cream sky (${CREAM} tones) with at most one or two faint soft clouds — ` +
    "quiet negative space, nothing detailed there. All scenery sits low and to the " +
    "right. Soft warm cream palette with gentle lime green (#ecf874) accents, soft " +
    "warm morning light, lo-fi wholesome vibes like Stardew Valley or A Short Hike. " +
    `Along the bottom edge the scene gradually melts into a flat solid ${CREAM} colour, ` +
    "a soft painted fade with no hard line. No text, no words, no letters, no logos, " +
    "no borders. Serene, nostalgic, emotionally warm.";

const SCENES = {
    home: {
        seed: 4101,
        prompt:
            "A gentle meadow garden where small pixel flowers and tiny code-plants grow " +
            "from neat garden beds, a little glass greenhouse far in the distance. " +
            `${BEE} hovers small in the right third of the frame, watering a code-plant ` +
            "with a tiny watering can.",
    },
    play: {
        seed: 4102,
        prompt:
            "A quiet outdoor painting spot at the edge of a garden, with a small wooden " +
            `easel and a few paint pots in the grass. ${ROBOT} stands small in the right ` +
            "third of the frame, painting a tiny picture on the easel.",
    },
    apps: {
        // Seed bumped: 4103 marched its stalls across the centre line and the
        // subtitle landed on an awning.
        seed: 4113,
        prompt:
            "A tiny quiet village lane where little market stalls are shaped like " +
            "pastel app windows, with awnings and small plants between them — the " +
            "whole lane tucked entirely into the right third of the frame, receding " +
            `into the distance toward the right edge. ${NOMNOM} strolls small among ` +
            "the stalls, happily carrying one colourful app window. Absolutely " +
            "nothing left of the centre line except empty pale sky.",
    },
    community: {
        seed: 4104,
        prompt:
            "A soft grassy hill with a small picnic blanket, tiny paper lanterns on a " +
            `string and a few pixel flowers. Three friends together small in the right ` +
            `third of the frame: ${BEE}, ${ROBOT}, and ${NOMNOM}, sitting close and ` +
            "celebrating.",
    },
};

async function draw(name, spec, token) {
    const prompt = `${SCENES[name].prompt} ${FRAME}`;
    const url =
        `${GEN}/${encodeURIComponent(prompt)}` +
        `?model=${MODEL}&width=2048&height=1152&nologo=true&seed=${spec.seed}`;

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

    // Crop to a ~2.4:1 banner keeping the GROUND — the sky is negative space
    // and can lose height; the scenery and the dissolve edge cannot.
    await run("magick", [
        src,
        "-gravity",
        "south",
        "-crop",
        "12:5",
        "+repage",
        "-resize",
        "2048x",
        "-quality",
        "80",
        "-define",
        "webp:method=6",
        join(OUT_DIR, `${name}.webp`),
    ]);
    await unlink(src);

    const { stdout } = await run("magick", [
        "identify",
        "-format",
        "%wx%h %b",
        join(OUT_DIR, `${name}.webp`),
    ]);
    return stdout.trim();
}

const token = process.env.POLLINATIONS_TOKEN;
if (!token) {
    console.error(
        "POLLINATIONS_TOKEN is required (an sk_ key with paid balance)",
    );
    process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
for (const [name, spec] of Object.entries(SCENES)) {
    if (ONLY && !ONLY.includes(name)) continue;
    process.stdout.write(`${name.padEnd(12)}`);
    if (!FORCE && existsSync(join(OUT_DIR, `${name}.webp`))) {
        console.log("skipped (already drawn)");
        continue;
    }
    try {
        console.log(await draw(name, spec, token));
    } catch (error) {
        console.log(`FAILED — ${error.message}`);
    }
}

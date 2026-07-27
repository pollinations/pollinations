/**
 * Placeholder cover art for app cards.
 *
 * The mockup pointed <img> straight at image.pollinations.ai/prompt/… . That
 * endpoint no longer serves anonymously (403), gen returns 401, and the site's
 * publishable pk_ key can't generate — by design it only starts an authorize
 * flow. So the mockup's URLs render as broken images today.
 *
 * Generating per visitor would be the wrong shape anyway: seven generations on
 * every Apps view, seconds of latency each, billed to whoever's key was in the
 * markup. These are drawn instead — a deterministic pixel landscape per app,
 * as an inline SVG data URI. No request, no cost, no key in the client, and it
 * paints on first frame.
 *
 * Same input always gives the same picture, so an app looks identical on Hello
 * and on Apps. Replace this with real screenshots when APPS.md carries them.
 */

type Palette = { sky: string; ground: string; ink: string };

/** One palette per APPS.md category, all keyed to the cream ground. */
const PALETTES: Record<string, Palette> = {
    image: { sky: "#fdf3d9", ground: "#ffd76d", ink: "#7c5e0b" },
    build: { sky: "#fdf1d2", ground: "#f0c368", ink: "#7c5e0b" },
    chat: { sky: "#efe9fb", ground: "#c4b5f0", ink: "#5b4a8a" },
    writing: { sky: "#eaf2e6", ground: "#a9c9a0", ink: "#4a6b46" },
    games: { sky: "#fbe9e4", ground: "#f0a58c", ink: "#8a4a3a" },
    learn: { sky: "#e4f0f2", ground: "#8fc3cc", ink: "#2f5f68" },
    business: { sky: "#eceef2", ground: "#a8b2c4", ink: "#45506b" },
    bots: { sky: "#e6edfa", ground: "#9db8e8", ink: "#3a5488" },
    video_audio: { sky: "#f4e9f4", ground: "#cba3cb", ink: "#6b3f6b" },
};
const FALLBACK: Palette = { sky: "#fdf3d9", ground: "#f2d79a", ink: "#7c5e0b" };

const COLS = 16;
const ROWS = 8;

/** xorshift — a tiny deterministic PRNG, so one name always draws one picture. */
function rng(seed: number) {
    let state = seed || 1;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return ((state >>> 0) % 1000) / 1000;
    };
}

function hash(text: string): number {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) {
        value ^= text.charCodeAt(i);
        value = Math.imul(value, 16777619);
    }
    return value >>> 0;
}

/**
 * A pixel horizon: a two-row floor, a skyline of blocks rising from it, and a
 * few scattered pixels above. A landscape rather than noise — random cells
 * read as a broken texture, a horizon reads as a picture.
 */
export function pixelCover(
    name: string,
    category: string | undefined,
    width: number,
    height: number,
): string {
    const palette = PALETTES[category?.toLowerCase() ?? ""] ?? FALLBACK;
    const next = rng(hash(name));
    const cw = width / COLS;
    const ch = height / ROWS;
    const cell = (x: number, y: number, w: number, h: number, fill: string) =>
        `<rect x="${(x * cw).toFixed(1)}" y="${(y * ch).toFixed(1)}" width="${(w * cw).toFixed(1)}" height="${(h * ch).toFixed(1)}" fill="${fill}"/>`;

    const parts = [cell(0, 0, COLS, ROWS, palette.sky)];

    // Sun or moon, always in the upper band, never over the skyline.
    const sunX = 1 + Math.floor(next() * (COLS - 3));
    parts.push(cell(sunX, 1, 1, 1, palette.ink));

    // Scattered pixels — sparse, so they read as detail rather than static.
    for (let i = 0; i < 7; i++) {
        const x = Math.floor(next() * COLS);
        const y = Math.floor(next() * 3);
        parts.push(cell(x, y, 1, 1, palette.ground));
    }

    // Skyline: each column rises 0–3 cells above the two-row floor.
    const floor = ROWS - 2;
    for (let x = 0; x < COLS; x++) {
        const rise = Math.floor(next() * 4);
        if (rise > 0)
            parts.push(cell(x, floor - rise, 1, rise, palette.ground));
        // A lit window in the taller blocks.
        if (rise >= 2 && next() > 0.55) {
            parts.push(cell(x, floor - rise + 1, 1, 1, palette.ink));
        }
    }
    parts.push(cell(0, floor, COLS, 2, palette.ground));
    parts.push(cell(0, ROWS - 1, COLS, 1, palette.ink));

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${parts.join("")}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

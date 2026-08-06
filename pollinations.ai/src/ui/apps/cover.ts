import COVERS from "./covers.json";

/**
 * Real product screenshots come from the public app directory. Generated art
 * committed under public/app-art/ remains the fallback for apps that do not
 * have a screenshot yet.
 *
 * Static, not generated at page load: anonymous generation is no longer
 * possible (the legacy prompt endpoint 403s, gen 401s, and the site's
 * publishable pk_ key can only start an authorize flow), and doing it live
 * would mean seven generations per Apps view, seconds each, billed to whatever
 * key sat in the markup.
 *
 * Only apps that can reach an image slot need generated fallback art. Anything
 * without a screenshot or generated fallback renders without a picture rather
 * than borrowing someone else's.
 */

const HAS_COVER = new Set<string>(COVERS);
const PLAYGROUND_SCREENSHOT =
    "https://media.pollinations.ai/7158f20b-4d9c-4026-a6f9-9fe452064a7a";

/** Must match slugify() in scripts/generate-app-art.mjs. */
function coverSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
}

export function appCover(name: string, screenshotUrl = ""): string | null {
    if (screenshotUrl) return screenshotUrl;
    if (name === "Pollinations Playground") return PLAYGROUND_SCREENSHOT;

    const slug = coverSlug(name);
    return HAS_COVER.has(slug) ? `/app-art/${slug}.webp` : null;
}

export function isAppScreenshot(src: string | null): boolean {
    return src?.startsWith("https://media.pollinations.ai/") ?? false;
}

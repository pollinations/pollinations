import COVERS from "./covers.json";

/**
 * Cover art for app cards — one unique image per app, generated from that
 * app's own name and description by scripts/generate-app-art.mjs and committed
 * under public/app-art/.
 *
 * Static, not generated at page load: anonymous generation is no longer
 * possible (the legacy prompt endpoint 403s, gen 401s, and the site's
 * publishable pk_ key can only start an authorize flow), and doing it live
 * would mean seven generations per Apps view, seconds each, billed to whatever
 * key sat in the markup.
 *
 * Only apps that can reach an image slot have art — the spotlight, and the top
 * of the directory that Hello's shelf and the Apps hero read from. Anything
 * else returns null and the card renders without a picture rather than
 * borrowing someone else's. Re-run the script when the directory shifts.
 */

const HAS_COVER = new Set<string>(COVERS);

/** Must match slugify() in scripts/generate-app-art.mjs. */
function coverSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
}

export function appCover(name: string): string | null {
    const slug = coverSlug(name);
    return HAS_COVER.has(slug) ? `/app-art/${slug}.webp` : null;
}

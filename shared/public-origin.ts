import type { Context } from "hono";

/**
 * The origin the request was sent to. Workers are attached to their public
 * hostnames directly, so this is the public origin. Client-sent forwarding
 * headers are ignored: nothing sits in front of the Workers to set them (#17462).
 */
export function getPublicOrigin(c: Context): string {
    return new URL(c.req.url).origin;
}

/** The URL the request was sent to. */
export function getPublicUrl(c: Context): URL {
    return new URL(c.req.url);
}

/**
 * gen <-> enter host pairs. Matching is bidirectional — either side of a
 * pair resolves to that pair — most-specific first. Anything unrecognised
 * (local dev, workerd previews, custom domains) falls back to production.
 */
const GEN_ENTER_HOST_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ["staging.gen.pollinations.ai", "staging.enter.pollinations.ai"],
    ["dev.gen.pollinations.ai", "dev.enter.pollinations.ai"],
    ["gen.pollinations.ai", "enter.pollinations.ai"],
];

/**
 * The sibling public host (gen <-> enter) for this origin.
 *
 * Known tiers (staging, dev) stay on their own tier in both directions;
 * unrecognised origins fall back to the production counterpart with the
 * port cleared, so a localhost:8788 deployment never advertises a
 * production host on a dev port.
 */
export function siblingOrigin(origin: string, to: "gen" | "enter"): string {
    const url = new URL(origin);
    const want = to === "gen" ? 0 : 1;
    const pair = GEN_ENTER_HOST_PAIRS.find(
        ([gen, enter]) => gen === url.hostname || enter === url.hostname,
    );
    url.hostname = pair
        ? pair[want]
        : to === "gen"
            ? "gen.pollinations.ai"
            : "enter.pollinations.ai";
    url.protocol = "https:";
    url.port = "";
    return url.origin;
}

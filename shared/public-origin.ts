import type { Context } from "hono";

/**
 * The origin the request was sent to. Workers are attached to their public
 * hostnames directly, so this is the public origin.
 */
export function getPublicOrigin(c: Context): string {
    return new URL(c.req.url).origin;
}

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

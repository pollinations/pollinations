import {
    productPageViewSchema,
    websitePageViewSchema,
} from "@shared/product-analytics.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { type Context, Hono } from "hono";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import {
    captureProductEvent,
    type ProductEvent,
    visitorCountry,
} from "../utils/product-analytics.ts";

// Enter's sibling website: enter.pollinations.ai → pollinations.ai,
// staging.enter.pollinations.ai → staging.pollinations.ai.
function websiteOrigin(c: Context<Env>): string {
    const url = new URL(getPublicOrigin(c));
    url.hostname = url.hostname.replace(/(^|\.)enter\./, "$1");
    return url.origin;
}

// Beacon: everything is read from the query string, never the body. Signed-out
// views are recorded with an empty user id. The browser sends no identifier,
// so every view is its own event.
async function recordPageView(
    c: Context<Env>,
    origin: string,
    schema: typeof productPageViewSchema | typeof websitePageViewSchema,
    event: ProductEvent,
) {
    if (c.req.header("Origin") !== origin) return c.body(null, 403);
    const view = schema.safeParse(c.req.query());
    if (!view.success) return c.body(null, 400);
    const session = await createAuth(c.env, c.executionCtx).api.getSession({
        headers: c.req.raw.headers,
        query: { disableRefresh: true },
    });
    c.executionCtx.waitUntil(
        captureProductEvent(c.env, event, session?.user.id ?? "", {
            ...view.data,
            ...visitorCountry(c.req.raw.headers),
        }),
    );
    return c.body(null, 204);
}

export const productAnalyticsRoutes = new Hono<Env>()
    .post("/page-view", (c) =>
        recordPageView(
            c,
            getPublicOrigin(c),
            productPageViewSchema,
            "page_viewed",
        ),
    )
    // Sent cross-origin by the website with sendBeacon, which carries Enter's
    // session cookie because both hosts are the same site.
    .post("/website-page-view", (c) =>
        recordPageView(
            c,
            websiteOrigin(c),
            websitePageViewSchema,
            "website_page_viewed",
        ),
    );

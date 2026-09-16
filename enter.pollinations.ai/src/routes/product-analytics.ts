import {
    authFlowViewSchema,
    productPageViewSchema,
} from "@shared/product-analytics.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { captureProductEvent } from "../utils/product-analytics.ts";

// Same-origin, bodyless beacons only; a Response means the beacon is refused.
function refuseBeacon(c: Context<Env>): Response | undefined {
    if (
        c.env.TINYBIRD_ANALYTICS_ENABLED !== "true" ||
        c.req.header("DNT") === "1"
    )
        return c.body(null, 204);
    if (c.req.header("Origin") !== getPublicOrigin(c)) return c.body(null, 403);
    if (c.req.raw.body) return c.body(null, 415);
    return undefined;
}

export const productAnalyticsRoutes = new Hono<Env>()
    .post("/page-view", async (c) => {
        const refused = refuseBeacon(c);
        if (refused) return refused;
        const view = productPageViewSchema.safeParse(c.req.query());
        if (!view.success) return c.body(null, 400);
        const session = await createAuth(c.env, c.executionCtx).api.getSession({
            headers: c.req.raw.headers,
            query: { disableRefresh: true },
        });
        if (!session?.user) return c.body(null, 401);
        c.executionCtx.waitUntil(
            captureProductEvent(
                c.env,
                "page_viewed",
                session.user.id,
                view.data,
            ),
        );
        return c.body(null, 204);
    })
    // Signed-out view of a page where sign-in starts. No session lookup: the
    // flow id is the only identity, and a reload re-sends the same event id.
    .post("/auth-flow", (c) => {
        const refused = refuseBeacon(c);
        if (refused) return refused;
        const view = authFlowViewSchema.safeParse(c.req.query());
        if (!view.success) return c.body(null, 400);
        c.executionCtx.waitUntil(
            captureProductEvent(
                c.env,
                "sign_in_viewed",
                "",
                view.data,
                `view:${view.data.flow_id}:${view.data.page}`,
            ),
        );
        return c.body(null, 204);
    });

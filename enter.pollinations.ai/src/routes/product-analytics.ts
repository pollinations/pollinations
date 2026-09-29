import { isPollenPackKey } from "@shared/pollen-packs.ts";
import { productPageViewSchema } from "@shared/product-analytics.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { Hono } from "hono";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import {
    captureProductEvent,
    visitorCountry,
} from "../utils/product-analytics.ts";

// Same-origin beacon: everything is read from the query string, never the
// body. Signed-out views are recorded with an empty user id. The browser sends
// no identifier, so every view is its own event.
export const productAnalyticsRoutes = new Hono<Env>()
    .post("/page-view", async (c) => {
        if (c.req.header("Origin") !== getPublicOrigin(c))
            return c.body(null, 403);
        const view = productPageViewSchema.safeParse(c.req.query());
        if (!view.success) return c.body(null, 400);
        const session = await createAuth(c.env, c.executionCtx).api.getSession({
            headers: c.req.raw.headers,
            query: { disableRefresh: true },
        });
        c.executionCtx.waitUntil(
            captureProductEvent(c.env, "page_viewed", session?.user.id ?? "", {
                ...view.data,
                ...visitorCountry(c.req.raw.headers),
            }),
        );
        return c.body(null, 204);
    })
    // The wallet modal's Stripe form rendered. Same beacon rules as above;
    // only signed-in buyers can reach checkout, so anonymous calls are dropped.
    .post("/checkout-ready", async (c) => {
        if (c.req.header("Origin") !== getPublicOrigin(c))
            return c.body(null, 403);
        const sessionId = c.req.query("session_id") ?? "";
        const packKey = c.req.query("pack_key") ?? "";
        if (!/^cs_\w{1,250}$/.test(sessionId) || !isPollenPackKey(packKey))
            return c.body(null, 400);
        const session = await createAuth(c.env, c.executionCtx).api.getSession({
            headers: c.req.raw.headers,
            query: { disableRefresh: true },
        });
        if (!session) return c.body(null, 401);
        c.executionCtx.waitUntil(
            captureProductEvent(
                c.env,
                "checkout_embedded_ready",
                session.user.id,
                {
                    pack_key: packKey,
                    mode: "embedded",
                    session_id: sessionId,
                    ...visitorCountry(c.req.raw.headers),
                },
            ),
        );
        return c.body(null, 204);
    });

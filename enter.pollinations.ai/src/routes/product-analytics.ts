import { productPageViewSchema } from "@shared/product-analytics.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { Hono } from "hono";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { captureProductEvent } from "../utils/product-analytics.ts";

export const productAnalyticsRoutes = new Hono<Env>().post(
    "/page-view",
    async (c) => {
        if (
            c.env.TINYBIRD_ANALYTICS_ENABLED !== "true" ||
            c.req.header("DNT") === "1"
        )
            return c.body(null, 204);
        if (c.req.header("Origin") !== getPublicOrigin(c))
            return c.body(null, 403);
        if (c.req.raw.body) return c.body(null, 415);
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
    },
);

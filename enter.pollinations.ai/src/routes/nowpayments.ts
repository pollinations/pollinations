import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

export const nowpaymentsRoutes = new Hono<Env>()
    .use("*", auth({ allowApiKey: false, allowSessionCookie: true }))
    .get(
        "/invoice/:pack",
        describeRoute({
            tags: ["Payments"],
            description:
                "Create a NOWPayments crypto invoice for a pollen pack.",
            hide: true,
        }),
        async (_c) => {
            throw new HTTPException(503, {
                message: "Crypto payments are temporarily unavailable",
            });
        },
    );

export type NowPaymentsRoutes = typeof nowpaymentsRoutes;

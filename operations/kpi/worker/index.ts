import { createPollinationsAuth } from "@pollinations/auth/server";
import { Hono } from "hono";
import type { Env } from "./env.ts";
import { kpiRoutes } from "./kpi.ts";

const app = new Hono<Env>()
    .use("*", async (c, next) => {
        const path = c.req.path;
        if (!path.startsWith("/api/") && !path.startsWith("/auth/")) {
            return c.env.ASSETS.fetch(c.req.raw);
        }
        c.header("Cache-Control", "private, no-store");
        if (!c.env.POLLINATIONS_AUTH_SESSION_SECRET) {
            return c.json(
                { error: "App session signing is not configured" },
                503,
            );
        }
        const auth = createPollinationsAuth({
            clientId: c.env.POLLINATIONS_OAUTH_CLIENT_ID,
            sessionSecret: c.env.POLLINATIONS_AUTH_SESSION_SECRET,
            baseUrl: c.env.POLLINATIONS_AUTH_BASE_URL,
        });
        const response = await auth.handle(c.req.raw);
        if (response) return response;
        if (
            !(await auth.getUser(c.req.raw, (value) =>
                c.header("Set-Cookie", value, { append: true }),
            ))
        ) {
            return c.json({ error: "Sign in to this app to continue" }, 401);
        }
        await next();
    })
    .route("/api/kpi", kpiRoutes);

export default app;

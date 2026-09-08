import { createPollinationsAuth } from "@pollinations/auth/server";
import { Hono } from "hono";
import { economicsRoutes } from "./economics.ts";
import type { Env } from "./env.ts";

const app = new Hono<Env>()
    .use("*", async (c, next) => {
        const path = c.req.path;
        if (
            !path.startsWith("/api/") &&
            !path.startsWith("/auth/") &&
            !path.startsWith("/private/")
        ) {
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
        if (!(await auth.getUser(c.req.raw))) {
            return c.json({ error: "Sign in to this app to continue" }, 401);
        }
        if (path.startsWith("/private/")) {
            const asset = await c.env.ASSETS.fetch(c.req.raw);
            const headers = new Headers(asset.headers);
            headers.set("Cache-Control", "private, no-store");
            return new Response(asset.body, { status: asset.status, headers });
        }
        await next();
    })
    .route("/api/economics", economicsRoutes);

export default app;

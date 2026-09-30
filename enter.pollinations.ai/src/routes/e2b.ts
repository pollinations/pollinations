import { SESSION_TOKEN_HEADER } from "@shared/auth/session.ts";
import { Hono } from "hono";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

// The dashboard's sandbox calls, passed through to gen's E2B API as the
// logged-in user. Gen runs, checks and bills them.
export const e2bRoutes = new Hono<Env>()
    .use("*", auth({ allowApiKey: false, allowSessionCookie: true }))
    .all("/:path{.+}", async (c) => {
        const { token } = c.var.auth.session ?? {};
        if (!token) return c.json({ message: "Log in first" }, 401);
        const response = await fetch(
            `${c.env.GEN_BASE_URL}/alpha/e2b/${c.req.param("path")}${new URL(c.req.url).search}`,
            {
                method: c.req.method,
                headers: {
                    "content-type": "application/json",
                    [SESSION_TOKEN_HEADER]: token,
                },
                body: c.req.method === "GET" ? undefined : await c.req.text(),
            },
        );
        return new Response(response.body, response);
    });

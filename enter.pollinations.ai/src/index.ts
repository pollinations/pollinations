import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "./auth.ts";
import { handleError } from "./error.ts";
import { processPolarEvents } from "./polar.ts";
import { polarRoutes } from "./routes/polar.ts";
import { proxyRoutes } from "./routes/proxy.ts";
import { requestId } from "hono/request-id";
import type { Env } from "./env.ts";

const authRoutes = new Hono<Env>().on(["GET", "POST"], "*", (c) => {
    return createAuth(c.env).handler(c.req.raw);
});

const app = new Hono<Env>()
    .use("*", requestId())
    .basePath("/api")
    .route("/auth", authRoutes)
    .route("/polar", polarRoutes)
    .route("/generate", proxyRoutes);

app.notFound((c) => {
    return handleError(new HTTPException(404, { message: "Not Found" }), c);
});

app.onError(handleError);

export type AppRoutes = typeof app;

export default {
    fetch: app.fetch,
    scheduled: (_controller, env, _ctx) => processPolarEvents(env),
} satisfies ExportedHandler<Cloudflare.Env>;

/**
 * gen.pollinations.ai - Hot-path API gateway
 *
 * Hot-path routes (image/text/audio/video/v1) execute natively in this worker.
 * Control-plane routes (auth/account/admin/docs/customer/...) forward to enter
 * via the ENTER service binding.
 *
 * Public URL surface:
 *   gen.pollinations.ai/                  → redirect to /api/docs (served by enter)
 *   gen.pollinations.ai/docs              → redirect to /api/docs
 *   gen.pollinations.ai/models            → /v1/models (native)
 *   gen.pollinations.ai/v1/*              → native (proxyRoutes)
 *   gen.pollinations.ai/image/*           → native (proxyRoutes)
 *   gen.pollinations.ai/text/*            → native (proxyRoutes)
 *   gen.pollinations.ai/audio/*           → native (proxyRoutes)
 *   gen.pollinations.ai/video/*           → native (proxyRoutes)
 *   gen.pollinations.ai/api/generate/*    → native (backwards-compat alias)
 *   gen.pollinations.ai/api/*             → forward to enter (control plane)
 *   gen.pollinations.ai/account/*         → forward to enter (rewritten /api/account/*)
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import type { Env } from "@/env.ts";
import { handleError } from "@/error.ts";
import { logger } from "@/middleware/logger.ts";
import { proxyRoutes } from "@/routes/proxy.ts";

interface GenEnv {
    Bindings: CloudflareBindings;
    Variables: Env["Variables"];
}

const app = new Hono<GenEnv>()
    .use(
        "*",
        cors({
            origin: "*",
            allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowHeaders: [],
            exposeHeaders: ["Content-Length", "Content-Disposition"],
            maxAge: 600,
        }),
    )
    .use("*", requestId())
    .use("*", logger)
    // Prevent search engines from indexing API responses (docs are an exception).
    .use("*", async (c, next) => {
        await next();
        if (!c.req.path.startsWith("/api/docs")) {
            c.header("X-Robots-Tag", "noindex, nofollow");
        }
    });

// Hot-path routes mounted at both bare and /api/generate prefixes.
// Mount at bare so /v1/models, /image/* etc. match directly.
// Mount at /api/generate so the long form (used by enter's old URL surface) keeps working.
app.route("/", proxyRoutes);
app.route("/api/generate", proxyRoutes);

// robots.txt — block generation paths, allow docs.
app.get("/robots.txt", (c) =>
    c.text(
        [
            "User-agent: *",
            "Allow: /api/docs",
            "Allow: /api/docs/llm.txt",
            "Disallow: /image/",
            "Disallow: /text/",
            "Disallow: /video/",
            "Disallow: /audio/",
            "Disallow: /v1/",
            "Disallow: /api/generate/",
            "Disallow: /api/v1/",
        ].join("\n"),
    ),
);

// Convenience: /models → /v1/models.
app.get("/models", (c) =>
    c.redirect(`${new URL(c.req.url).origin}/v1/models`, 301),
);

// Root + /docs → enter's /api/docs.
app.get("/", (c) => c.redirect(`${new URL(c.req.url).origin}/api/docs`, 301));
app.get("/docs", (c) =>
    c.redirect(`${new URL(c.req.url).origin}/api/docs`, 301),
);

// Control-plane forward: /api/* and /account/* go to enter.
app.all("/api/*", async (c) => c.env.ENTER.fetch(c.req.raw));
app.all("/account/*", async (c) => {
    const url = new URL(c.req.url);
    url.pathname = `/api${url.pathname}`;
    return c.env.ENTER.fetch(url, c.req.raw);
});

app.notFound(async (c: Context<GenEnv>) => {
    return await handleError(new HTTPException(404), c);
});

app.onError(handleError);

export default {
    fetch: app.fetch,
} satisfies ExportedHandler<CloudflareBindings>;

import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import type { Env as GenerationEnv } from "@/env.ts";
import { handleError } from "@/error.ts";
import { logger } from "@/middleware/logger.ts";
import { audioRoutes } from "./routes/audio.ts";
import { createDocsRoutes } from "./routes/docs.ts";
import { proxyRoutes } from "./routes/proxy.ts";

export function createGenerationApp(): Hono<GenerationEnv> {
    const app = new Hono<GenerationEnv>()
        // Permissive CORS for generation endpoints. Auth is API-key based.
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
        .use("*", async (c, next) => {
            await next();
            if (!c.req.path.startsWith("/docs")) {
                c.header("X-Robots-Tag", "noindex, nofollow");
            }
        });

    app.route("/docs", createDocsRoutes(app))
        .route("/v1/audio", audioRoutes)
        .route("/", proxyRoutes);

    app.notFound(async (c: Context<GenerationEnv>) => {
        return handleError(new HTTPException(404), c);
    });

    app.onError(handleError);

    return app;
}

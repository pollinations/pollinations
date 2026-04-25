import {
    type Context,
    type ErrorHandler,
    Hono,
    type MiddlewareHandler,
} from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import type { Env as GenerationEnv } from "@/env.ts";
import { handleError } from "@/error.ts";
import { logger } from "@/middleware/logger.ts";
import { audioRoutes } from "@/routes/audio.ts";
import { proxyRoutes } from "@/routes/proxy.ts";

const generationLogger = logger as unknown as MiddlewareHandler<GenerationEnv>;
const generationErrorHandler =
    handleError as unknown as ErrorHandler<GenerationEnv>;
const generationProxyRoutes = proxyRoutes as unknown as Hono<GenerationEnv>;
const generationAudioRoutes = audioRoutes as unknown as Hono<GenerationEnv>;

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
        .use("*", generationLogger)
        .use("*", async (c, next) => {
            await next();
            c.header("X-Robots-Tag", "noindex, nofollow");
        })
        .route("/api/generate", generationProxyRoutes)
        .route("/api/generate/v1/audio", generationAudioRoutes);

    app.notFound(async (c: Context<GenerationEnv>) => {
        return generationErrorHandler(new HTTPException(404), c);
    });

    app.onError(generationErrorHandler);

    return app;
}

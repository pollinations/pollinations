import { handleError } from "@shared/error.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { api } from "./api.ts";
import type { Env } from "./env.ts";
import { logger } from "./middleware/logger.ts";
import { createDocsRoutes } from "./routes/docs.ts";
import { syncGithubMirror } from "./services/github-mirror.ts";
import { runQuestEvaluator } from "./services/quest-evaluator.ts";
import { runTierRefill } from "./services/tier-refill.ts";

function stripTrailingSlash(path: string): string {
    return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function isApiDocsPath(path: string): boolean {
    return path === "/api/docs" || path.startsWith("/api/docs/");
}

function redirectLegacyDocs(c: Context<Env>): Response {
    const reqUrl = new URL(c.req.url);
    const publicOrigin = new URL(getPublicOrigin(c));
    const url = new URL(reqUrl.pathname + reqUrl.search, publicOrigin);
    url.hostname = url.hostname.replace(/(^|\.)enter\./, "$1gen.");
    url.protocol = "https:";
    url.pathname = url.pathname.replace(/^\/api\/docs(?=\/|$)/, "/docs");
    url.pathname = stripTrailingSlash(url.pathname);
    return c.redirect(url.toString(), 301);
}

function getCurrentGenOrigin(c: Context<Env>): string {
    const url = new URL(getPublicOrigin(c));
    url.protocol = "https:";
    url.hostname = url.hostname.replace(/(^|\.)enter\./, "$1gen.");
    return url.origin;
}

const app = new Hono<Env>()
    // Permissive CORS for all API endpoints (all require API keys for auth)
    .use(
        "*",
        cors({
            origin: "*",
            allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowHeaders: [], // reflect Access-Control-Request-Headers (permissive; origin already "*")
            exposeHeaders: ["Content-Length", "Content-Disposition"],
            maxAge: 600,
        }),
    )
    .use("*", requestId())
    .use("*", logger)
    // Prevent search engines from indexing API responses (except docs)
    .use("/api/*", async (c, next) => {
        await next();
        if (!isApiDocsPath(c.req.path)) {
            c.header("X-Robots-Tag", "noindex, nofollow");
        }
    })
    .route("/api/docs", createDocsRoutes(api))
    .all("/api/docs", redirectLegacyDocs)
    .all("/api/docs/", redirectLegacyDocs)
    .all("/api/docs/*", redirectLegacyDocs)
    .all("/api/generate/*", (c) => {
        const reqUrl = new URL(c.req.url);
        const publicOrigin = new URL(getPublicOrigin(c));
        const url = new URL(reqUrl.pathname + reqUrl.search, publicOrigin);
        url.hostname = url.hostname.replace(/(^|\.)enter\./, "$1gen.");
        url.protocol = "https:";
        url.pathname = url.pathname.replace(/^\/api\/generate/, "");
        c.header("Deprecation", "true");
        c.header(
            "Link",
            `<${getCurrentGenOrigin(c)}>; rel="successor-version"`,
        );
        return c.redirect(url.toString(), 308);
    })
    .route("/api", api);

app.notFound(async (c: Context<Env>) => {
    return await handleError(new HTTPException(404), c);
});

app.onError(handleError);

export type AppRoutes = typeof app;

export default {
    fetch: app.fetch,
    async scheduled(
        _event: ScheduledController,
        env: CloudflareBindings,
        ctx: ExecutionContext,
    ) {
        // The quest evaluator derives community GitHub bounties from the gh_*
        // mirror, so the mirror must refresh BEFORE the evaluator runs — that
        // way a bounty completed since the last tick records this tick instead
        // of waiting another 15 minutes. A mirror failure must not skip the
        // evaluator (it can still record from the previous snapshot), so it's caught.
        const mirrorThenEvaluate = syncGithubMirror(env)
            .catch((error) => {
                console.error("GitHub mirror sync failed:", error);
            })
            .then(() =>
                runQuestEvaluator(env).catch((error) => {
                    console.error("Quest evaluator failed:", error);
                }),
            );

        // Tier refill is independent of the mirror; run it concurrently. Both
        // chains are awaited so a manual trigger reflects completion + errors.
        await Promise.allSettled([
            runTierRefill(env, ctx).catch((error) => {
                console.error("Tier refill failed:", error);
            }),
            mirrorThenEvaluate,
        ]);
    },
} satisfies ExportedHandler<CloudflareBindings>;

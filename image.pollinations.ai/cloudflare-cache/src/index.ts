import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { addMigrationHeaders } from "../../../shared/legacy-migration.js";
import { ATTRIBUTION_HEADERS, addAttributionHeaders } from "./attribution.ts";
import type { Env } from "./env";
import { exactCache } from "./middleware/exact-cache";
import { turnstileVerification } from "./middleware/turnstile.ts";
import { feed, generate, logFailure, utility } from "./origin.ts";

const app = new Hono<Env>();

app.use(
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["*"],
        exposeHeaders: [
            ...Object.keys(ATTRIBUTION_HEADERS),
            "Payment-Required",
            "Payment-Response",
        ],
    }),
);

// Why a request failed, readable by browser clients too
const ERROR_EXPOSED_HEADERS = [
    "X-Error-Type",
    "X-Error-Status",
    "X-Error-Message",
    "X-Rate-Limited",
    "X-Cache",
];

/** The migration pointers and the exposed error headers of every response */
export function addImageMigrationHeaders(headers: Headers) {
    addMigrationHeaders(headers, "image", ERROR_EXPOSED_HEADERS);
}

app.use("*", async (c, next) => {
    await next();
    if (c.res.ok) {
        addAttributionHeaders(c.res.headers);
    }
    // Cache hits and errors carry the migration pointers too.
    try {
        addImageMigrationHeaders(c.res.headers);
    } catch {
        // Immutable headers (e.g. a raw cached Response): rebuild once.
        c.res = new Response(c.res.body, c.res);
        addImageMigrationHeaders(c.res.headers);
    }
});

// cache image requests; misses are generated here
app.all("/prompt/:prompt", turnstileVerification, exactCache, async (c) => {
    const url = new URL(c.req.url);
    const response = await generateOr500(c, url, "/prompt/:prompt");
    response.headers.set("X-Cache", "MISS");
    return response;
});

// answer known utility endpoints; every other path generates as /prompt{path}
app.all("*", async (c) => {
    const url = new URL(c.req.url);
    const pathname = url.pathname;

    // Known utility paths keep their path
    const utilityPaths = [
        "/models",
        "/about",
        "/register",
        "/feed",
        "/crossdomain.xml",
        "/.well-known",
    ];
    const isUtility = utilityPaths.some(
        (p) => pathname === p || pathname.startsWith(p + "/"),
    );

    if (isUtility && pathname.startsWith("/feed")) {
        return feed(c.env, c.req.method, url.search);
    }
    if (isUtility) return utility(c.req.method, pathname);

    // Everything else gets rewritten to /prompt/
    if (!pathname.startsWith("/prompt") && !pathname.startsWith("/delete")) {
        url.pathname = `/prompt${pathname}`;
    }
    return generateOr500(c, url, "*");
});

/**
 * generate(), with an exception answered as Hono's default error handler
 * would. `url` is the request URL after the /prompt rewrite.
 */
async function generateOr500(c: Context<Env>, url: URL, route: string) {
    try {
        return await generate(c, url, route);
    } catch (error) {
        logFailure(route, { error: "exception", type: error.name });
        return c.text("Internal Server Error", 500);
    }
}

// Durable Object classes must be exported by the Worker's main module
export { FeedHub } from "../../../shared/feed-hub.js";
export { IpSlot } from "../../../shared/ip-slot.js";

export default app;

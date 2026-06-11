import type { Context } from "hono";
import { Hono } from "hono";
import { createAuth } from "./auth.ts";
import type { Env } from "./env.ts";
import { frontendApi } from "./frontend-api.ts";
import { adminRoutes } from "./routes/admin.ts";
import { stripeWebhooksRoutes } from "./routes/stripe-webhooks.ts";

const NATIVE_API_KEY_REDIRECT_METADATA = new Set([
    "redirectUris",
    "redirectUri",
    "redirectOrigin",
    "requestedClientId",
    "deviceUserCode",
]);

function hasNativeApiKeyRedirectMetadata(body: unknown): boolean {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return false;
    }
    const metadata = (body as { metadata?: unknown }).metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return false;
    }
    return Object.keys(metadata).some((key) =>
        NATIVE_API_KEY_REDIRECT_METADATA.has(key),
    );
}

async function rejectNativeApiKeyRedirectMetadata(
    c: Context<Env>,
    next: () => Promise<void>,
) {
    let body: unknown;
    try {
        body = await c.req.raw.clone().json();
    } catch {
        return await next();
    }

    if (hasNativeApiKeyRedirectMetadata(body)) {
        return c.json(
            {
                error: "API key redirect metadata must be managed through the Pollinations API key routes",
            },
            400,
        );
    }

    return await next();
}

const authRoutes = new Hono<Env>()
    .use("/api-key/create", rejectNativeApiKeyRedirectMetadata)
    .use("/api-key/update", rejectNativeApiKeyRedirectMetadata)
    .on(["GET", "POST"], "*", async (c) => {
        return await createAuth(c.env, c.executionCtx).handler(c.req.raw);
    });

export const api = new Hono<Env>()
    .route("/auth", authRoutes)
    .route("/", frontendApi)
    .route("/webhooks", stripeWebhooksRoutes)
    .route("/admin", adminRoutes);

export type ApiRoutes = typeof api;

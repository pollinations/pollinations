import {
    getRedirectUris,
    parseMetadata,
} from "@shared/auth/api-key-metadata.ts";
import { redirectUriMatchesAllowlistExact } from "@shared/auth/redirect-uri.ts";
import { appKeyTopUp } from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    confirmAppTopUp,
    getAppPurchase,
    requireSandboxPurchase,
} from "../utils/app-purchase.ts";

export const appPurchaseRoutes = new Hono<Env>()
    .use("*", async (c, next) => {
        requireSandboxPurchase(c.env);
        c.header("Cache-Control", "no-store");
        await next();
    })
    .get(
        "/intent/:id",
        auth({ allowApiKey: false, allowSessionCookie: true }),
        async (c) => {
            const purchase = await getAppPurchase(
                c.env,
                c.req.param("id"),
                c.var.auth.requireUser().id,
            );
            return c.json(purchase);
        },
    )
    .post(
        "/intent/:id",
        auth({ allowApiKey: false, allowSessionCookie: true }),
        async (c) => {
            // Only Enter's own confirmation page may authorize a larger key allowance.
            if (
                c.req.header("Origin") !== new URL(c.env.BETTER_AUTH_URL).origin
            )
                throw new HTTPException(403);
            const purchase = await confirmAppTopUp(
                c.env,
                c.req.param("id"),
                c.var.auth.requireUser().id,
            );
            return c.json(purchase);
        },
    )
    .post(
        "/",
        auth({ allowApiKey: true, allowSessionCookie: false }),
        validator(
            "json",
            z.object({
                amount: z.union([
                    z.literal(10),
                    z.literal(20),
                    z.literal(50),
                    z.literal(100),
                ]),
                returnTo: z.enum([
                    "http://localhost:5173/play",
                    "http://localhost:4179/play",
                    "http://127.0.0.1:4179/play",
                    "https://pollinations-ai-website-v2.elliot-b6e.workers.dev/play",
                ]),
            }),
        ),
        async (c) => {
            const user = c.var.auth.requireUser();
            const key = c.var.auth.apiKey;
            if (!key?.byopClientKeyId || c.var.auth.agentRun)
                throw new HTTPException(403, {
                    message: "Connect an app account first",
                });
            if (key.pollenBalance == null)
                throw new HTTPException(400, {
                    message: "This key already has unlimited allowance.",
                });
            const input = c.req.valid("json");
            const client = await c.env.DB.prepare(
                "SELECT name, metadata FROM apikey WHERE id = ? AND prefix = ? AND enabled = 1 AND (expires_at IS NULL OR expires_at > ?)",
            )
                .bind(key.byopClientKeyId, "pk", Math.floor(Date.now() / 1000))
                .first<{ name: string; metadata: string | null }>();
            if (
                !client ||
                !redirectUriMatchesAllowlistExact(
                    input.returnTo,
                    getRedirectUris(parseMetadata(client.metadata)),
                )
            ) {
                throw new HTTPException(400, {
                    message: "Return URL is not registered for this app",
                });
            }
            const id = crypto.randomUUID();
            const purchase = {
                ...input,
                userId: user.id,
                keyId: key.id,
                clientKeyId: key.byopClientKeyId,
                id,
                createdAt: Date.now(),
            };
            await drizzle(c.env.DB).insert(appKeyTopUp).values(purchase);
            const url = new URL("/buy", c.env.STRIPE_SUCCESS_URL);
            url.searchParams.set("purchase", id);
            return c.json({ url: url.toString() });
        },
    )
    .get(
        "/status/:id",
        auth({ allowApiKey: true, allowSessionCookie: false }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const key = c.var.auth.apiKey;
            if (!key?.byopClientKeyId || c.var.auth.agentRun)
                throw new HTTPException(403);
            const purchase = await getAppPurchase(
                c.env,
                c.req.param("id"),
                user.id,
            );
            if (purchase.keyId !== key.id) throw new HTTPException(404);
            return c.json({
                completed: purchase.completedAt !== null,
                purchased: purchase.completedAt ? purchase.checkoutPack : null,
                balance: purchase.balance,
                allowance: purchase.allowance,
            });
        },
    );

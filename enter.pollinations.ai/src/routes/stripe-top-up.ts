import { redirectUriMatchesAllowlist } from "@shared/auth/redirect-uri.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { getPollenPackByKey } from "@shared/pollen-packs.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import Stripe from "stripe";
import { z } from "zod";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { type AuthVariables, auth } from "../middleware/auth.ts";
import { getCohortFromCountry } from "../utils/currency-router.ts";
import { createPackCheckoutSession } from "../utils/stripe-checkout.ts";
import { generateCode } from "./device.ts";
import { getRedirectUris, parseMetadata } from "./metadata-utils.ts";

const INTENT_TTL_SECONDS = 10 * 60;
const CHECKOUT_TTL_SECONDS = 30 * 60;
// Covers stripe-node's request timeout plus its automatic network retry while
// keeping the effective Checkout lifetime close to the requested 30 minutes.
const CHECKOUT_EXPIRY_MARGIN_SECONDS = 5 * 60;
const REDEEMED_INTENT_GRACE_SECONDS = 5 * 60;
const TOKEN_LENGTH = 40;
const MAX_AUTO_RETRIES = 3;

type TopUpEnv = {
    Bindings: CloudflareBindings;
    Variables: Env["Variables"] & AuthVariables;
};

type CheckoutMode = "customer" | "guest";

type TopUpIntent = {
    userId: string;
    delegatedKeyId: string;
    parentAppKeyId: string;
    parentAppName: string;
    packKey: string;
    returnUri: string;
    topupState: string;
    createdAt: string;
    intentExpiresAt: string;
    checkoutUrl?: string;
    checkoutExpiresAt?: string;
    checkoutMode?: CheckoutMode;
};

const CreateTopUpIntentSchema = z.object({
    packKey: z.string().min(1),
    returnUri: z.string().min(1).max(2048),
    topupState: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9_-]+$/),
});

export const stripeTopUpRoutes = new Hono<TopUpEnv>()
    .use("*", async (c, next) => {
        c.header("Cache-Control", "no-store");
        c.header("Referrer-Policy", "no-referrer");
        await next();
    })
    .post(
        "/top-up-intents",
        auth({ allowApiKey: true, allowSessionCookie: false }),
        validator("json", CreateTopUpIntentSchema),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            const delegatedKey = c.var.auth.apiKey;
            const parentAppKeyId = delegatedKey?.byopClientKeyId;
            if (!delegatedKey || !parentAppKeyId) {
                throw new HTTPException(403, {
                    message:
                        "Top-up intents require a delegated BYOP secret key",
                });
            }

            await enforceIntentRateLimit(c.env, delegatedKey.id);

            const body = c.req.valid("json");
            const pack = getPollenPackByKey(body.packKey);
            if (!pack) {
                throw new HTTPException(400, { message: "Invalid pack" });
            }

            const db = drizzle(c.env.DB, { schema });
            const parentAppKey = await db.query.apikey.findFirst({
                where: eq(schema.apikey.id, parentAppKeyId),
            });
            if (
                !parentAppKey ||
                parentAppKey.prefix !== "pk" ||
                parentAppKey.enabled === false
            ) {
                throw new HTTPException(403, {
                    message: "Originating BYOP app key is unavailable",
                });
            }

            const allowlist = getRedirectUris(
                parseMetadata(parentAppKey.metadata),
            );
            const returnUri = canonicalizeReturnUri(body.returnUri, allowlist);
            if (!returnUri) {
                throw new HTTPException(400, {
                    message:
                        "returnUri is not registered for the originating BYOP app",
                });
            }

            const now = new Date();
            const token = generateCode(TOKEN_LENGTH);
            const intent: TopUpIntent = {
                userId: user.id,
                delegatedKeyId: delegatedKey.id,
                parentAppKeyId,
                parentAppName: parentAppKey.name ?? "Pollinations app",
                packKey: pack.packKey,
                returnUri,
                topupState: body.topupState,
                createdAt: now.toISOString(),
                intentExpiresAt: new Date(
                    now.getTime() + INTENT_TTL_SECONDS * 1000,
                ).toISOString(),
            };
            await c.env.KV.put(intentKey(token), JSON.stringify(intent), {
                expirationTtl: INTENT_TTL_SECONDS,
            });

            const url = new URL(
                `/api/stripe/top-up/${token}`,
                getPublicOrigin(c),
            );
            c.header("Cache-Control", "no-store");
            return c.json({ url: url.toString() });
        },
    )
    .get("/top-up/:token", async (c) => {
        const token = c.req.param("token");
        if (!new RegExp(`^[A-Za-z0-9]{${TOKEN_LENGTH}}$`).test(token)) {
            return expiredIntentPage(c);
        }

        const intent = await readIntent(c.env.KV, token);
        if (!intent) {
            const retryCount = Math.max(0, Number(c.req.query("retry")) || 0);
            return retryCount < MAX_AUTO_RETRIES
                ? retryConflictPage(c, token)
                : expiredIntentPage(c);
        }
        if (
            !intent.checkoutUrl &&
            Date.parse(intent.intentExpiresAt) <= Date.now()
        ) {
            return expiredIntentPage(c);
        }

        const sessionUserId = await getSessionUserId(c);
        if (intent.checkoutUrl) {
            return replayCheckout(c, intent, sessionUserId);
        }

        const pack = getPollenPackByKey(intent.packKey);
        if (!pack) return expiredIntentPage(c);

        const checkoutMode: CheckoutMode =
            sessionUserId === intent.userId ? "customer" : "guest";
        const successUrl = callbackUrl(intent, "success");
        const cancelUrl = callbackUrl(intent, "canceled");
        try {
            const checkout = await createPackCheckoutSession({
                env: c.env,
                userId: intent.userId,
                pack,
                cohort: getCohortFromCountry(c.req.header("cf-ipcountry")),
                successUrl,
                cancelUrl,
                mode: checkoutMode,
                metadata: {
                    source: "byop_topup",
                    parentAppKeyId: intent.parentAppKeyId,
                    delegatedKeyId: intent.delegatedKeyId,
                },
                expiresAfterSeconds:
                    CHECKOUT_TTL_SECONDS + CHECKOUT_EXPIRY_MARGIN_SECONDS,
                idempotencyKey: token,
            });
            if (!checkout.url) {
                throw new Error("Stripe Checkout Session has no URL");
            }

            const checkoutExpiresAt = checkout.expires_at;
            const redeemedIntent: TopUpIntent = {
                ...intent,
                checkoutUrl: checkout.url,
                checkoutExpiresAt: new Date(
                    checkoutExpiresAt * 1000,
                ).toISOString(),
                checkoutMode,
            };
            const ttl = Math.max(
                60,
                checkoutExpiresAt -
                    Math.floor(Date.now() / 1000) +
                    REDEEMED_INTENT_GRACE_SECONDS,
            );
            await c.env.KV.put(
                intentKey(token),
                JSON.stringify(redeemedIntent),
                { expirationTtl: ttl },
            );

            return c.redirect(checkout.url);
        } catch (error) {
            if (isStripeIdempotencyError(error)) {
                const winner = await readIntent(c.env.KV, token);
                if (winner?.checkoutUrl) {
                    return replayCheckout(c, winner, sessionUserId);
                }
                return retryConflictPage(c, token);
            }

            console.error("BYOP top-up checkout error:", error);
            return statusPage(
                c,
                500,
                "Checkout unavailable",
                "We could not start Checkout. Please return to the app and try again.",
            );
        }
    });

async function enforceIntentRateLimit(
    env: CloudflareBindings,
    delegatedKeyId: string,
): Promise<void> {
    if (!env.TOP_UP_RATE_LIMITER) {
        if (env.ENVIRONMENT === "production" || env.ENVIRONMENT === "staging") {
            throw new HTTPException(503, {
                message: "Top-up service is temporarily unavailable",
            });
        }
        return;
    }

    const { success } = await env.TOP_UP_RATE_LIMITER.limit({
        key: delegatedKeyId,
    });
    if (!success) {
        throw new HTTPException(429, {
            message: "Too many top-up attempts. Please try again shortly.",
        });
    }
}

function canonicalizeReturnUri(
    value: string,
    allowlist: readonly string[],
): string | null {
    let incoming: URL;
    try {
        incoming = new URL(value);
    } catch {
        return null;
    }
    if (incoming.protocol !== "https:" && incoming.protocol !== "http:") {
        return null;
    }

    incoming.hash = "";
    incoming.searchParams.delete("topup");
    incoming.searchParams.delete("topup_state");
    const sanitized = incoming.toString();

    for (const entry of allowlist) {
        if (!redirectUriMatchesAllowlist(sanitized, [entry])) continue;
        try {
            const registered = new URL(entry);
            if (
                registered.protocol !== "https:" &&
                registered.protocol !== "http:"
            ) {
                continue;
            }
            return registered.toString();
        } catch {}
    }
    return null;
}

function callbackUrl(intent: TopUpIntent, status: "success" | "canceled") {
    const url = new URL(intent.returnUri);
    url.searchParams.set("topup", status);
    url.searchParams.set("topup_state", intent.topupState);
    return url.toString();
}

function intentKey(token: string) {
    return `topup-intent:${token}`;
}

async function readIntent(kv: KVNamespace, token: string) {
    return kv.get<TopUpIntent>(intentKey(token), "json");
}

async function getSessionUserId(c: Context<TopUpEnv>): Promise<string | null> {
    const session = await createAuth(c.env, c.executionCtx).api.getSession({
        headers: c.req.raw.headers,
    });
    return session?.user?.id ?? null;
}

async function replayCheckout(
    c: Context<TopUpEnv>,
    intent: TopUpIntent,
    sessionUserId: string | null,
) {
    if (
        !intent.checkoutUrl ||
        !intent.checkoutMode ||
        !intent.checkoutExpiresAt ||
        Date.parse(intent.checkoutExpiresAt) <= Date.now()
    ) {
        return expiredIntentPage(c);
    }
    if (intent.checkoutMode === "customer" && sessionUserId !== intent.userId) {
        return statusPage(
            c,
            403,
            "Open this from the original browser",
            "This Checkout is connected to your Pollinations session. Resume it from the browser where you started.",
        );
    }
    return c.redirect(intent.checkoutUrl);
}

function isStripeIdempotencyError(error: unknown): boolean {
    return (
        error instanceof Stripe.errors.StripeIdempotencyError ||
        (typeof error === "object" &&
            error !== null &&
            ((error as { type?: unknown }).type === "StripeIdempotencyError" ||
                (error as { rawType?: unknown }).rawType ===
                    "idempotency_error"))
    );
}

function expiredIntentPage(c: Context<TopUpEnv>) {
    return statusPage(
        c,
        410,
        "Top-up link expired",
        "Return to the app and start a new top-up.",
    );
}

function retryConflictPage(c: Context<TopUpEnv>, token: string) {
    const retryCount = Math.max(0, Number(c.req.query("retry")) || 0);
    const relativePath = `/api/stripe/top-up/${encodeURIComponent(token)}`;
    if (retryCount < MAX_AUTO_RETRIES) {
        const retryUrl = `${relativePath}?retry=${retryCount + 1}`;
        c.header("Retry-After", "1");
        return c.html(
            pageHtml(
                "Finishing Checkout",
                "Checkout is being prepared. This page will retry automatically.",
                retryUrl,
                true,
            ),
            409,
        );
    }

    return c.html(
        pageHtml(
            "Checkout is still being prepared",
            "Please retry once more. No payment session has been duplicated.",
            relativePath,
            false,
        ),
        409,
    );
}

function statusPage(
    c: Context<TopUpEnv>,
    status: ContentfulStatusCode,
    title: string,
    message: string,
) {
    return c.html(pageHtml(title, message), status);
}

function pageHtml(
    title: string,
    message: string,
    retryUrl?: string,
    autoRetry = false,
) {
    const retryMeta =
        retryUrl && autoRetry
            ? `<meta http-equiv="refresh" content="1;url=${retryUrl}">`
            : "";
    const retryLink = retryUrl
        ? `<p><a href="${retryUrl}">Retry Checkout</a></p>`
        : "";
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${retryMeta}<title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p>${retryLink}</main></body></html>`;
}

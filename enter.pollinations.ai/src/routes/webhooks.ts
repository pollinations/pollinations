import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getLogger } from "@logtape/logtape";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { Polar } from "@polar-sh/sdk";
import {
    validateEvent,
    WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import type { Env } from "../env.ts";
import { user as userTable } from "../db/schema/better-auth.ts";
import { syncUserTier } from "../tier-sync.ts";
import {
    isValidTier,
    getTierProductMapCached,
    type TierName,
} from "@/utils/polar.ts";
import { WebhookSubscriptionRevokedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionrevokedpayload.js";
import { WebhookSubscriptionCanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncanceledpayload.js";
import { WebhookSubscriptionUpdatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionupdatedpayload.js";
import { WebhookSubscriptionCreatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncreatedpayload.js";
import { WebhookBenefitGrantCycledPayload } from "@polar-sh/sdk/models/components/webhookbenefitgrantcycledpayload.js";
import { WebhookBenefitGrantCreatedPayload } from "@polar-sh/sdk/models/components/webhookbenefitgrantcreatedpayload.js";
import { WebhookBenefitGrantUpdatedPayload } from "@polar-sh/sdk/models/components/webhookbenefitgrantupdatedpayload.js";
import { WebhookOrderPaidPayload } from "@polar-sh/sdk/models/components/webhookorderpaidpayload.js";
import { sql } from "drizzle-orm";

const log = getLogger(["hono", "webhooks"]);

// Send Polar webhook event to Tinybird for analytics
async function sendPolarEventToTinybird(
    env: Cloudflare.Env,
    payload: unknown,
): Promise<void> {
    const tinybirdUrl = env.TINYBIRD_POLAR_INGEST_URL;
    const tinybirdToken = env.TINYBIRD_INGEST_TOKEN;

    if (!tinybirdUrl || !tinybirdToken) {
        log.debug("Tinybird Polar ingest not configured, skipping");
        return;
    }

    // Extract fields from payload
    const p = payload as {
        type?: string;
        data?: { customer?: { externalId?: string } };
    };
    const userId = p?.data?.customer?.externalId ?? "";
    const eventType = p?.type ?? "";

    // Build event with extracted fields + full payload
    const event = {
        timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
        event_type: eventType,
        user_id: userId,
        payload,
    };

    try {
        const response = await fetch(tinybirdUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tinybirdToken}`,
                "Content-Type": "application/x-ndjson",
            },
            body: JSON.stringify(event),
        });

        if (!response.ok) {
            const errorText = await response.text();
            log.error(
                "Failed to send Polar event to Tinybird: {status} {error}",
                {
                    status: response.status,
                    error: errorText,
                },
            );
        }
    } catch (error) {
        log.error("Error sending Polar event to Tinybird: {error}", { error });
    }
}

// Extract tier from product metadata slug (e.g., "v1:product:tier:spore" -> "spore")
function tierFromProductSlug(slug: string | undefined): TierName | null {
    if (!slug?.includes(":tier:")) return null;
    const tier = slug.split(":").at(-1);
    return tier && isValidTier(tier) ? tier : null;
}

export const webhooksRoutes = new Hono<Env>().post("/polar", async (c) => {
    const webhookSecret = c.env.POLAR_WEBHOOK_SECRET;

    if (!webhookSecret) {
        log.warn("POLAR_WEBHOOK_SECRET not configured");
        throw new HTTPException(500, { message: "Webhook not configured" });
    }

    const rawBody = await c.req.text();
    const headers = Object.fromEntries(c.req.raw.headers.entries());

    try {
        const payload = validateEvent(rawBody, headers, webhookSecret);
        log.info("📥 POLAR_WEBHOOK: type={webhookType}", {
            eventType: "polar_webhook",
            webhookType: payload.type,
            payload,
        });

        // Send to Tinybird asynchronously (don't await to avoid blocking webhook response)
        sendPolarEventToTinybird(c.env, payload).catch((err) =>
            log.error("Tinybird send failed: {error}", { error: err }),
        );

        switch (payload.type) {
            case "subscription.canceled":
            case "subscription.revoked":
                await handleSubscriptionCanceled(c.env, payload);
                break;

            case "subscription.updated":
                await handleSubscriptionUpdated(c.env, payload);
                break;

            case "subscription.created":
                await handleSubscriptionCreated(payload);
                break;

            case "benefit_grant.cycled":
                await handleBenefitGrantCycled(c.env, payload);
                break;

            case "benefit_grant.created":
                await handleBenefitGrant(
                    c.env,
                    payload,
                    "benefit_grant.created",
                );
                break;

            case "benefit_grant.updated":
                await handleBenefitGrant(
                    c.env,
                    payload,
                    "benefit_grant.updated",
                );
                break;

            case "order.paid":
                await handleOrderPaid(c.env, payload);
                break;

            default:
                log.debug("Unhandled webhook type: {type}", {
                    type: payload.type,
                });
        }
    } catch (error) {
        if (error instanceof WebhookVerificationError) {
            log.warn("Invalid webhook signature: {error}", {
                error: error.message,
            });
            throw new HTTPException(401, { message: "Invalid signature" });
        }
        log.warn("Invalid webhook payload: {error}", { error });
        throw new HTTPException(400, { message: "Invalid payload" });
    }

    return c.json({ received: true });
});

async function handleSubscriptionCanceled(
    env: Cloudflare.Env,
    event:
        | WebhookSubscriptionCanceledPayload
        | WebhookSubscriptionRevokedPayload,
): Promise<void> {
    const externalId = event.data.customer.externalId;
    if (!externalId) {
        log.warn(
            "Received subscription canceled webhook without external customer id",
        );
        return;
    }

    // Look up the user's tier from D1 (source of truth)
    const db = drizzle(env.DB);
    const users = await db
        .select({ tier: userTable.tier })
        .from(userTable)
        .where(eq(userTable.id, externalId))
        .limit(1);

    const userTier = users[0]?.tier;
    if (!userTier || !isValidTier(userTier)) {
        log.warn("User {userId} has invalid tier {tier}, defaulting to spore", {
            userId: externalId,
            tier: userTier,
        });
    }

    const targetTier: TierName = isValidTier(userTier) ? userTier : "spore";

    log.info(
        "Subscription canceled for user {userId}, reactivating to tier {tier}",
        {
            userId: externalId,
            tier: targetTier,
        },
    );

    // Initialize Polar and sync immediately
    if (!env.POLAR_ACCESS_TOKEN) {
        log.error(
            "Cannot reactivate subscription: POLAR_ACCESS_TOKEN not configured",
        );
        return;
    }

    const polar = new Polar({
        accessToken: env.POLAR_ACCESS_TOKEN,
        server: env.POLAR_SERVER === "production" ? "production" : "sandbox",
    });

    const productMap = await getTierProductMapCached(polar, env.KV);
    const result = await syncUserTier(
        polar,
        externalId,
        targetTier,
        productMap,
    );

    if (result.success) {
        log.info(
            "Reactivated subscription for user {userId} in {attempts} attempt(s)",
            {
                userId: externalId,
                attempts: result.attempts,
            },
        );
    } else {
        log.error(
            "Failed to reactivate subscription for user {userId}: {error}",
            {
                userId: externalId,
                error: result.error,
            },
        );
    }
}

async function handleSubscriptionUpdated(
    env: Cloudflare.Env,
    payload: WebhookSubscriptionUpdatedPayload,
): Promise<void> {
    const externalId = payload.data.customer.externalId;
    if (!externalId) {
        log.warn("subscription.updated without external customer id");
        return;
    }

    // Extract tier from product.metadata.slug (e.g., "v1:product:tier:seed")
    const product = payload.data.product as { metadata?: { slug?: string } };
    const slug = product?.metadata?.slug;
    const tier = tierFromProductSlug(slug);

    if (!tier) {
        log.debug("subscription.updated for user {userId} - no tier in slug", {
            userId: externalId,
            slug,
        });
        return;
    }

    const db = drizzle(env.DB);
    await db
        .update(userTable)
        .set({ tier })
        .where(eq(userTable.id, externalId));

    log.info("[POLAR_CREDIT] subscription: user={userId} tier={tier}", {
        userId: externalId,
        tier,
    });
}

async function handleSubscriptionCreated(
    payload: WebhookSubscriptionCreatedPayload,
): Promise<void> {
    const externalId = payload.data.customer.externalId;
    if (!externalId) {
        log.warn(
            "Received subscription.created webhook without external customer id",
        );
        return;
    }

    log.debug("Subscription created for user {userId}", {
        userId: externalId,
    });
}

async function handleBenefitGrantCycled(
    env: Cloudflare.Env,
    payload: WebhookBenefitGrantCycledPayload,
): Promise<void> {
    const externalId = payload.data.customer.externalId;
    if (!externalId) {
        log.warn(
            "Received benefit_grant.cycled webhook without external customer id",
        );
        return;
    }

    // Type guard: only meter_credit grants have lastCreditedUnits
    const properties = payload.data.properties as {
        lastCreditedUnits?: number;
    };
    const units = properties.lastCreditedUnits;
    if (!units || units <= 0) {
        log.debug(
            "benefit_grant.cycled for user {userId} has no units to credit",
            { userId: externalId },
        );
        return;
    }

    const db = drizzle(env.DB);
    const now = Math.floor(Date.now() / 1000);

    // SET tier_balance to the grant amount (not add) - tier meter resets on each cycle
    // Also record when this grant happened for future migration to self-managed grants
    await db
        .update(userTable)
        .set({
            tierBalance: units,
            lastTierGrant: now,
        })
        .where(eq(userTable.id, externalId));

    log.info(
        "Set tier_balance to {units} for user {userId} via benefit_grant.cycled",
        { units, userId: externalId },
    );
}

// Shared handler for benefit_grant.created and benefit_grant.updated
// Routes tier benefits to tierBalance and pack benefits to packBalance
async function handleBenefitGrant(
    env: Cloudflare.Env,
    payload:
        | WebhookBenefitGrantCreatedPayload
        | WebhookBenefitGrantUpdatedPayload,
    eventType: string,
): Promise<void> {
    const externalId = payload.data.customer.externalId;
    if (!externalId) {
        log.warn("{event} without external customer id", { event: eventType });
        return;
    }

    const benefit = payload.data.benefit as {
        type?: string;
        properties?: { units?: number };
    };

    if (benefit?.type !== "meter_credit") return;

    const units = benefit.properties?.units;
    if (!units || units <= 0) return;

    // Distinguish pack vs tier by checking orderId vs subscriptionId
    // Pack purchases have orderId set, tier subscriptions have subscriptionId set
    const orderId = (payload.data as { orderId?: string }).orderId;
    const subscriptionId = (payload.data as { subscriptionId?: string })
        .subscriptionId;
    const isPack = orderId != null;

    const db = drizzle(env.DB);

    try {
        if (isPack) {
            // Pack purchase: ADD to pack_balance (cumulative)
            const result = await db
                .update(userTable)
                .set({
                    packBalance: sql`COALESCE(${userTable.packBalance}, 0) + ${units}`,
                })
                .where(eq(userTable.id, externalId))
                .returning({
                    id: userTable.id,
                    packBalance: userTable.packBalance,
                });

            // Structured logging for Cloudflare dashboard filtering via properties.eventType
            log.info(
                "💰 PACK_PURCHASE: user={userId} +{units} pollen orderId={orderId} email={email} newBalance={newBalance} rowsUpdated={rowsUpdated}",
                {
                    eventType: "pack_purchase",
                    userId: externalId,
                    units,
                    orderId,
                    email: payload.data.customer.email ?? "unknown",
                    newBalance: result[0]?.packBalance ?? null,
                    rowsUpdated: result.length,
                },
            );

            if (result.length === 0) {
                log.warn(
                    "⚠️ PACK_PURCHASE_NO_USER: user={userId} not found in database orderId={orderId}",
                    {
                        eventType: "pack_purchase_error",
                        userId: externalId,
                        orderId,
                        error: "user_not_found",
                    },
                );
            }
        } else {
            // Tier subscription: SET tier_balance (reset each cycle, not cumulative)
            const result = await db
                .update(userTable)
                .set({
                    tierBalance: units,
                    lastTierGrant: Math.floor(Date.now() / 1000),
                })
                .where(eq(userTable.id, externalId))
                .returning({
                    id: userTable.id,
                    tierBalance: userTable.tierBalance,
                });

            // Structured logging for Cloudflare dashboard filtering via properties.eventType
            log.info(
                "🎫 TIER_GRANT: user={userId} balance={units} pollen subscriptionId={subscriptionId} rowsUpdated={rowsUpdated}",
                {
                    eventType: "tier_grant",
                    userId: externalId,
                    units,
                    subscriptionId,
                    rowsUpdated: result.length,
                },
            );

            if (result.length === 0) {
                log.warn(
                    "⚠️ TIER_GRANT_NO_USER: user={userId} not found in database subscriptionId={subscriptionId}",
                    {
                        eventType: "tier_grant_error",
                        userId: externalId,
                        subscriptionId,
                        error: "user_not_found",
                    },
                );
            }
        }
    } catch (error) {
        log.error(
            "❌ BENEFIT_GRANT_ERROR: user={userId} error={errorMessage}",
            {
                eventType: isPack ? "pack_purchase_error" : "tier_grant_error",
                userId: externalId,
                units,
                orderId: orderId ?? null,
                subscriptionId: subscriptionId ?? null,
                errorMessage:
                    error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
            },
        );
        throw error;
    }
}

async function handleOrderPaid(
    _env: Cloudflare.Env,
    payload: WebhookOrderPaidPayload,
): Promise<void> {
    // Pack purchases are handled by benefit_grant.created webhook which includes
    // the full benefit with units. This handler is kept for logging/future use.
    const externalId = payload.data.customer.externalId;
    log.debug(
        "order.paid for user {userId} (packs handled via benefit_grant)",
        {
            userId: externalId ?? "unknown",
            productId: payload.data.productId,
        },
    );
}

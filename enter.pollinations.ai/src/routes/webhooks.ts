import { getLogger } from "@logtape/logtape";
import type { WebhookBenefitGrantCreatedPayload } from "@polar-sh/sdk/models/components/webhookbenefitgrantcreatedpayload.js";
import type { WebhookBenefitGrantUpdatedPayload } from "@polar-sh/sdk/models/components/webhookbenefitgrantupdatedpayload.js";
import type { WebhookOrderPaidPayload } from "@polar-sh/sdk/models/components/webhookorderpaidpayload.js";
import {
    validateEvent,
    WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { user as userTable } from "../db/schema/better-auth.ts";
import type { Env } from "../env.ts";

const log = getLogger(["hono", "webhooks"]);

// Send Polar webhook event to Tinybird for analytics
async function sendPolarEventToTinybird(
    env: Cloudflare.Env,
    payload: unknown,
): Promise<void> {
    const e = env as unknown as Record<string, string>;
    const tinybirdUrl = e.TINYBIRD_POLAR_INGEST_URL;
    const tinybirdToken = e.TINYBIRD_POLAR_INGEST_TOKEN;

    if (!tinybirdUrl || !tinybirdToken) {
        log.debug("Tinybird Polar ingest not configured, skipping");
        return;
    }

    // Extract fields from payload for analytics indexing
    // Note: data_id is intentionally generic - it represents the primary entity ID
    // (subscription_id, order_id, benefit_grant_id, etc.) depending on event_type.
    // For detailed queries, use JSONExtract on the payload column.
    const p = payload as {
        type?: string;
        data?: {
            id?: string;
            customer?: { id?: string; externalId?: string };
            customerId?: string;
            productId?: string;
            product?: { id?: string };
            subscription?: { id?: string; productId?: string };
            order?: { id?: string; productId?: string };
        };
    };
    const eventType = p?.type ?? "";
    const userId = p?.data?.customer?.externalId ?? "";
    const customerId = p?.data?.customer?.id ?? p?.data?.customerId ?? "";
    const productId =
        p?.data?.productId ??
        p?.data?.product?.id ??
        p?.data?.subscription?.productId ??
        p?.data?.order?.productId ??
        "";
    const dataId = p?.data?.id ?? "";

    // Build event with extracted fields + full payload (timestamp uses DEFAULT now() in schema)
    const event = {
        event_type: eventType,
        user_id: userId,
        customer_id: customerId,
        product_id: productId,
        data_id: dataId,
        payload: JSON.stringify(payload),
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

        // Send to Tinybird in background using waitUntil to prevent cancellation
        c.executionCtx.waitUntil(
            sendPolarEventToTinybird(c.env, payload).catch((err) =>
                log.error("Tinybird send failed: {error}", { error: err }),
            ),
        );

        switch (payload.type) {
            // Tier subscription events - DEPRECATED
            // Tier is now managed via D1 + daily cron refill, not Polar webhooks
            case "subscription.canceled":
            case "subscription.revoked":
            case "subscription.updated":
            case "subscription.created":
            case "benefit_grant.cycled":
                log.debug(
                    "Ignoring tier-related webhook {type} - tier managed via D1/cron",
                    { type: payload.type },
                );
                break;

            // Pack purchase events - Polar webhooks update D1 packBalance
            case "benefit_grant.created":
                await handlePackBenefitGrant(
                    c.env,
                    payload,
                    "benefit_grant.created",
                );
                break;

            case "benefit_grant.updated":
                await handlePackBenefitGrant(
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

// Handler for pack purchases only (benefit_grant.created/updated with orderId)
// Tier subscriptions are now managed via D1/cron, not webhooks
async function handlePackBenefitGrant(
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

    // Only handle pack purchases (have orderId), skip tier subscriptions (have subscriptionId)
    const orderId = (payload.data as { orderId?: string }).orderId;
    if (!orderId) {
        // This is a tier subscription grant - skip, tier managed via D1/cron
        log.debug(
            "Skipping tier subscription grant for user {userId} - tier managed via D1/cron",
            { userId: externalId },
        );
        return;
    }

    const db = drizzle(env.DB);

    try {
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
    } catch (error) {
        log.error(
            "❌ PACK_PURCHASE_ERROR: user={userId} error={errorMessage}",
            {
                eventType: "pack_purchase_error",
                userId: externalId,
                units,
                orderId,
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

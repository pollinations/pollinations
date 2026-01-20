import { getLogger } from "@logtape/logtape";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { user as userTable } from "../db/schema/better-auth.ts";
import type { Env } from "../env.ts";

const log = getLogger(["hono", "webhooks-crypto"]);

// Send crypto webhook event to Tinybird for analytics
async function sendCryptoEventToTinybird(
    env: Cloudflare.Env,
    payload: NowPaymentsIpnPayload,
    userId: string,
): Promise<void> {
    const e = env as unknown as Record<string, string>;
    const tinybirdUrl = e.TINYBIRD_CRYPTO_INGEST_URL;
    const tinybirdToken = e.TINYBIRD_CRYPTO_INGEST_TOKEN;

    if (!tinybirdUrl || !tinybirdToken) {
        log.debug("Tinybird Crypto ingest not configured, skipping");
        return;
    }

    // Build event with extracted fields + full payload (timestamp uses DEFAULT now() in schema)
    const event = {
        event_type: payload.payment_status,
        user_id: userId,
        payment_id: String(payload.payment_id),
        order_id: payload.order_id,
        pay_currency: payload.pay_currency,
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
                "Failed to send crypto event to Tinybird: {status} {error}",
                {
                    status: response.status,
                    error: errorText,
                },
            );
        }
    } catch (error) {
        log.error("Error sending crypto event to Tinybird: {error}", { error });
    }
}

// Crypto-only pack names (includes €1 option not available via Polar)
const cryptoPackNames = ["1x2", "5x2", "10x2", "20x2", "50x2"] as const;
type CryptoPackName = (typeof cryptoPackNames)[number];

// Pollen amounts per pack (with 2x beta bonus)
const PACK_POLLEN: Record<CryptoPackName, number> = {
    "1x2": 2, // €1 = 2 pollen (2x bonus)
    "5x2": 10, // €5 = 10 pollen (2x bonus)
    "10x2": 20, // €10 = 20 pollen (2x bonus)
    "20x2": 40, // €20 = 40 pollen (2x bonus)
    "50x2": 100, // €50 = 100 pollen (2x bonus)
};

// NOWPayments IPN payload type
interface NowPaymentsIpnPayload {
    payment_id: number;
    payment_status: string;
    pay_address: string;
    price_amount: number;
    price_currency: string;
    pay_amount: number;
    actually_paid: number;
    actually_paid_fiat?: number; // Fiat equivalent of actually_paid
    pay_currency: string;
    order_id: string;
    order_description: string;
    purchase_id?: string;
    created_at: string;
    updated_at: string;
    outcome_amount?: number;
    outcome_currency?: string;
}

async function verifyIpnSignatureAsync(
    payload: Record<string, unknown>,
    signature: string,
    secret: string,
): Promise<boolean> {
    const sortedKeys = Object.keys(payload).sort();
    const sortedPayload: Record<string, unknown> = {};
    for (const key of sortedKeys) {
        sortedPayload[key] = payload[key];
    }
    const jsonString = JSON.stringify(sortedPayload);

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(jsonString);

    try {
        const key = await crypto.subtle.importKey(
            "raw",
            keyData,
            { name: "HMAC", hash: "SHA-512" },
            false,
            ["sign"],
        );
        const signatureBuffer = await crypto.subtle.sign(
            "HMAC",
            key,
            messageData,
        );
        const hashArray = Array.from(new Uint8Array(signatureBuffer));
        const hashHex = hashArray
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        return hashHex === signature;
    } catch {
        return false;
    }
}

function parseOrderId(
    orderId: string,
): { userId: string; pack: CryptoPackName } | null {
    // Format: userId:pack:timestamp
    const parts = orderId.split(":");
    if (parts.length < 2) return null;

    const userId = parts[0];
    const pack = parts[1] as CryptoPackName;

    if (!cryptoPackNames.includes(pack)) return null;

    return { userId, pack };
}

export const webhooksCryptoRoutes = new Hono<Env>().post(
    "/nowpayments",
    async (c) => {
        const ipnSecret = c.env.NOWPAYMENTS_IPN_SECRET;

        if (!ipnSecret) {
            log.warn("NOWPAYMENTS_IPN_SECRET not configured");
            throw new HTTPException(500, { message: "Webhook not configured" });
        }

        const signature = c.req.header("x-nowpayments-sig");
        if (!signature) {
            log.warn("Missing x-nowpayments-sig header");
            throw new HTTPException(401, { message: "Missing signature" });
        }

        const rawBody = await c.req.text();
        let payload: NowPaymentsIpnPayload;

        try {
            payload = JSON.parse(rawBody);
        } catch {
            log.warn("Invalid JSON in webhook payload");
            throw new HTTPException(400, { message: "Invalid JSON" });
        }

        // Verify signature
        const isValid = await verifyIpnSignatureAsync(
            payload as unknown as Record<string, unknown>,
            signature,
            ipnSecret,
        );

        if (!isValid) {
            log.warn("Invalid NOWPayments webhook signature");
            throw new HTTPException(401, { message: "Invalid signature" });
        }

        log.info("Received NOWPayments webhook: {payload}", {
            paymentId: payload.payment_id,
            status: payload.payment_status,
            orderId: payload.order_id,
            priceAmount: payload.price_amount,
            actuallyPaidFiat: payload.actually_paid_fiat,
        });

        // Parse order_id early to get userId for Tinybird logging
        const orderInfoForLogging = parseOrderId(payload.order_id);
        const userIdForLogging = orderInfoForLogging?.userId ?? "";

        // Send to Tinybird in background using waitUntil to prevent cancellation
        c.executionCtx.waitUntil(
            sendCryptoEventToTinybird(c.env, payload, userIdForLogging).catch(
                (err) =>
                    log.error("Tinybird crypto send failed: {error}", {
                        error: err,
                    }),
            ),
        );

        // Accept finished or partially_paid payments
        // partially_paid occurs when crypto amount is slightly less due to network fees
        if (
            payload.payment_status !== "finished" &&
            payload.payment_status !== "partially_paid"
        ) {
            log.debug("Ignoring payment status: {status}", {
                status: payload.payment_status,
            });
            return c.json({ received: true, processed: false });
        }

        // For partially_paid, only credit if user paid at least 90% of the expected amount
        if (payload.payment_status === "partially_paid") {
            const actuallyPaidFiat = payload.actually_paid_fiat ?? 0;
            const expectedAmount = payload.price_amount;
            const paidRatio = actuallyPaidFiat / expectedAmount;
            if (paidRatio < 0.9) {
                log.warn(
                    "Partial payment below 90% threshold: {actuallyPaidFiat}/{expectedAmount} ({paidRatio}%)",
                    {
                        actuallyPaidFiat,
                        expectedAmount,
                        paidRatio: Math.round(paidRatio * 100),
                        paymentId: payload.payment_id,
                    },
                );
                return c.json({
                    received: true,
                    processed: false,
                    reason: "partial_payment_below_threshold",
                });
            }
        }

        // Parse order_id to get user and pack
        const orderInfo = parseOrderId(payload.order_id);
        if (!orderInfo) {
            log.error("Invalid order_id format: {orderId}", {
                orderId: payload.order_id,
            });
            throw new HTTPException(400, {
                message: "Invalid order_id format",
            });
        }

        const { userId, pack } = orderInfo;
        const pollenAmount = PACK_POLLEN[pack];

        // Idempotency: payment_id is logged to Tinybird for audit trail
        // NOWPayments only sends webhooks on status changes, not arbitrary replays
        // Manual dashboard replays are rare and can be reconciled via Tinybird logs

        // Credit pollen to user's crypto balance (separate from fiat pack balance)
        const db = drizzle(c.env.DB);
        const result = await db
            .update(userTable)
            .set({
                cryptoBalance: sql`COALESCE(${userTable.cryptoBalance}, 0) + ${pollenAmount}`,
            })
            .where(eq(userTable.id, userId));

        // Check if user was found and updated (D1 uses meta.changes)
        if (result.meta?.changes === 0) {
            log.error("User not found for crypto credit: {userId}", { userId });
            throw new HTTPException(400, { message: "User not found" });
        }

        log.info(
            "[CRYPTO_CREDIT] crypto: user={userId} +{pollen} pack={pack} paymentId={paymentId} status={status}",
            {
                userId,
                pollen: pollenAmount,
                pack,
                paymentId: payload.payment_id,
                status: payload.payment_status,
                actuallyPaidFiat: payload.actually_paid_fiat,
                priceAmount: payload.price_amount,
            },
        );

        return c.json({ received: true, processed: true });
    },
);

export type WebhooksCryptoRoutes = typeof webhooksCryptoRoutes;

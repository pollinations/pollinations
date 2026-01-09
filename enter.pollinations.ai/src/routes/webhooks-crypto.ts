import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getLogger } from "@logtape/logtape";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import type { Env } from "../env.ts";
import { user as userTable } from "../db/schema/better-auth.ts";
const log = getLogger(["hono", "webhooks-crypto"]);

// Crypto-only pack names (includes $1 option not available via Polar)
const cryptoPackNames = ["1x2", "5x2", "10x2", "20x2", "50x2"] as const;
type CryptoPackName = (typeof cryptoPackNames)[number];

// Pollen amounts per pack (with 2x beta bonus)
const PACK_POLLEN: Record<CryptoPackName, number> = {
    "1x2": 2, // $1 = 2 pollen (2x bonus)
    "5x2": 10, // $5 = 10 pollen (2x bonus)
    "10x2": 20, // $10 = 20 pollen (2x bonus)
    "20x2": 40, // $20 = 40 pollen (2x bonus)
    "50x2": 100, // $50 = 100 pollen (2x bonus)
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

        // Accept finished payments OR partially_paid when fiat value is sufficient
        // partially_paid occurs when crypto amount is slightly less due to network fees,
        // but the fiat equivalent may still meet or exceed the price
        const isFinished = payload.payment_status === "finished";
        const isPartiallyPaidButSufficient =
            payload.payment_status === "partially_paid" &&
            payload.actually_paid_fiat !== undefined &&
            payload.actually_paid_fiat >= payload.price_amount * 0.99; // Allow 1% tolerance

        if (!isFinished && !isPartiallyPaidButSufficient) {
            log.debug("Ignoring payment status: {status}", {
                status: payload.payment_status,
                actuallyPaidFiat: payload.actually_paid_fiat,
                priceAmount: payload.price_amount,
            });
            return c.json({ received: true, processed: false });
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

        // Credit pollen to user's crypto balance (separate from fiat pack balance)
        const db = drizzle(c.env.DB);

        await db
            .update(userTable)
            .set({
                cryptoBalance: sql`COALESCE(${userTable.cryptoBalance}, 0) + ${pollenAmount}`,
            })
            .where(eq(userTable.id, userId));

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

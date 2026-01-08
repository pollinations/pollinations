import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";
import type { Env } from "../env.ts";
import { describeRoute } from "hono-openapi";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { user as userTable } from "@/db/schema/better-auth.ts";

// Pollen amounts for each price tier (2x multiplier like Polar)
const POLLEN_AMOUNTS: Record<number, number> = {
    5: 10,
    10: 20,
    20: 40,
    50: 100,
};

const checkoutParamsSchema = z.object({
    amount: z.coerce.number().refine((v) => v in POLLEN_AMOUNTS, {
        message: "Invalid amount. Must be 5, 10, 20, or 50",
    }),
});

const redirectQuerySchema = z.object({
    redirect: z
        .enum(["true", "false"])
        .transform((v) => v.toLowerCase().trim() === "true")
        .optional()
        .default(true),
});

// Stripe API helper - using fetch since we're on Cloudflare Workers
async function stripeRequest<T>(
    secretKey: string,
    endpoint: string,
    method: "GET" | "POST" = "POST",
    body?: Record<string, unknown>,
): Promise<T> {
    const url = `https://api.stripe.com/v1${endpoint}`;
    const headers: Record<string, string> = {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
    };

    let formBody: string | undefined;
    if (body) {
        formBody = encodeStripeBody(body);
    }

    const response = await fetch(url, {
        method,
        headers,
        body: formBody,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Stripe API error: ${JSON.stringify(error)}`);
    }

    return response.json() as Promise<T>;
}

// Encode nested objects for Stripe's form-urlencoded format
function encodeStripeBody(obj: Record<string, unknown>, prefix = ""): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}[${key}]` : key;

        if (value === null || value === undefined) {
            continue;
        } else if (Array.isArray(value)) {
            value.forEach((item, index) => {
                if (typeof item === "object" && item !== null) {
                    parts.push(
                        encodeStripeBody(
                            item as Record<string, unknown>,
                            `${fullKey}[${index}]`,
                        ),
                    );
                } else {
                    parts.push(
                        `${encodeURIComponent(`${fullKey}[${index}]`)}=${encodeURIComponent(String(item))}`,
                    );
                }
            });
        } else if (typeof value === "object") {
            parts.push(
                encodeStripeBody(value as Record<string, unknown>, fullKey),
            );
        } else {
            parts.push(
                `${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`,
            );
        }
    }

    return parts.filter(Boolean).join("&");
}

// Verify Stripe webhook signature
async function verifyStripeSignature(
    payload: string,
    signature: string,
    secret: string,
): Promise<boolean> {
    const parts = signature.split(",").reduce(
        (acc, part) => {
            const [key, value] = part.split("=");
            acc[key] = value;
            return acc;
        },
        {} as Record<string, string>,
    );

    const timestamp = parts["t"];
    const expectedSig = parts["v1"];

    if (!timestamp || !expectedSig) {
        return false;
    }

    // Check timestamp is within 5 minutes
    const timestampAge =
        Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    if (timestampAge > 300) {
        return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(signedPayload),
    );
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    return computedSig === expectedSig;
}

export const stripeRoutes = new Hono<Env>()
    // Checkout endpoint - requires auth
    .get(
        "/checkout/:amount",
        describeRoute({
            tags: ["Payments"],
            description:
                "Creates a Stripe checkout session for PayPal/card payment",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        auth({ allowApiKey: false, allowSessionCookie: true }),
        validator("param", checkoutParamsSchema),
        validator("query", redirectQuerySchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { amount } = c.req.valid("param");
            const { redirect } = c.req.valid("query");
            const pollenAmount = POLLEN_AMOUNTS[amount];

            const stripeKey = c.env.STRIPE_SECRET_KEY;
            if (!stripeKey) {
                throw new HTTPException(500, {
                    message: "Stripe not configured",
                });
            }

            try {
                // Create a Stripe Checkout Session with PayPal enabled
                const session = await stripeRequest<{
                    id: string;
                    url: string;
                }>(stripeKey, "/checkout/sessions", "POST", {
                    mode: "payment",
                    payment_method_types: ["card", "paypal"],
                    line_items: [
                        {
                            price_data: {
                                currency: "usd",
                                unit_amount: amount * 100, // Stripe uses cents
                                product_data: {
                                    name: `${pollenAmount} Pollen Credits`,
                                    description: `Add ${pollenAmount} pollen to your Myceli.AI account`,
                                },
                            },
                            quantity: 1,
                        },
                    ],
                    metadata: {
                        userId: user.id,
                        pollenAmount: String(pollenAmount),
                        amountUsd: String(amount),
                    },
                    // Enable invoice creation for customer records
                    invoice_creation: {
                        enabled: true,
                        invoice_data: {
                            description: `Myceli.AI - ${pollenAmount} Pollen Credits`,
                            metadata: {
                                userId: user.id,
                                pollenAmount: String(pollenAmount),
                            },
                        },
                    },
                    success_url: `${c.env.POLAR_SUCCESS_URL}?payment=success`,
                    cancel_url: `${c.env.POLAR_SUCCESS_URL}?payment=cancelled`,
                    customer_email: user.email || undefined,
                });

                if (redirect) {
                    return c.redirect(session.url);
                }
                return c.json({ url: session.url, sessionId: session.id });
            } catch (e) {
                console.error("Stripe checkout error:", e);
                throw new HTTPException(500, { cause: e });
            }
        },
    )
    // Webhook endpoint - no auth required, verified by signature
    .post(
        "/webhook",
        describeRoute({
            tags: ["Payments"],
            description: "Stripe webhook endpoint for payment events",
            hide: true,
        }),
        async (c) => {
            const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;
            if (!webhookSecret) {
                throw new HTTPException(500, {
                    message: "Webhook secret not configured",
                });
            }

            const signature = c.req.header("stripe-signature");
            if (!signature) {
                throw new HTTPException(400, { message: "Missing signature" });
            }

            const payload = await c.req.text();

            // Verify webhook signature
            const isValid = await verifyStripeSignature(
                payload,
                signature,
                webhookSecret,
            );
            if (!isValid) {
                throw new HTTPException(400, { message: "Invalid signature" });
            }

            const event = JSON.parse(payload) as {
                type: string;
                data: {
                    object: {
                        id: string;
                        metadata?: {
                            userId?: string;
                            pollenAmount?: string;
                            amountUsd?: string;
                        };
                        payment_status?: string;
                    };
                };
            };

            // Handle checkout.session.completed
            if (event.type === "checkout.session.completed") {
                const session = event.data.object;
                const userId = session.metadata?.userId;
                const pollenAmount = session.metadata?.pollenAmount;

                if (!userId || !pollenAmount) {
                    console.error(
                        "Missing metadata in webhook:",
                        session.metadata,
                    );
                    return c.json({
                        received: true,
                        error: "Missing metadata",
                    });
                }

                if (session.payment_status !== "paid") {
                    console.log(
                        "Payment not completed:",
                        session.payment_status,
                    );
                    return c.json({ received: true, skipped: "Not paid" });
                }

                // Credit pollen to user
                const db = drizzle(c.env.DB);
                const pollenToAdd = parseInt(pollenAmount, 10);

                try {
                    await db
                        .update(userTable)
                        .set({
                            packBalance: sql`COALESCE(${userTable.packBalance}, 0) + ${pollenToAdd}`,
                        })
                        .where(eq(userTable.id, userId));

                    console.log(
                        `Credited ${pollenToAdd} pollen to user ${userId} via Stripe`,
                    );
                } catch (dbError) {
                    console.error("Failed to credit pollen:", dbError);
                    throw new HTTPException(500, {
                        message: "Failed to credit pollen",
                    });
                }
            }

            return c.json({ received: true });
        },
    );

export type StripeRoutes = typeof stripeRoutes;

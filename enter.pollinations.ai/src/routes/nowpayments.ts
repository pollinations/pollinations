import { getLogger } from "@logtape/logtape";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import z from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";

const log = getLogger(["hono", "nowpayments"]);

// NOWPayments API URLs
const NOWPAYMENTS_API_URL = {
    sandbox: "https://api-sandbox.nowpayments.io/v1",
    production: "https://api.nowpayments.io/v1",
};

// Crypto-only pack names (includes $1 option not available via Polar)
const cryptoPackNames = ["1x2", "5x2", "10x2", "20x2", "50x2"] as const;
type CryptoPackName = (typeof cryptoPackNames)[number];

// Map pack names to USD amounts
const PACK_AMOUNTS: Record<CryptoPackName, number> = {
    "1x2": 1,
    "5x2": 5,
    "10x2": 10,
    "20x2": 20,
    "50x2": 50,
};

// Pack descriptions for invoices
const PACK_DESCRIPTIONS: Record<CryptoPackName, string> = {
    "1x2": "2 Pollen Pack ($1)",
    "5x2": "10 Pollen Pack ($5)",
    "10x2": "20 Pollen Pack ($10)",
    "20x2": "40 Pollen Pack ($20)",
    "50x2": "100 Pollen Pack ($50)",
};

const packParamSchema = z.enum(cryptoPackNames);

const invoiceParamsSchema = z.object({
    pack: packParamSchema,
});

const redirectQuerySchema = z.object({
    redirect: z
        .enum(["true", "false"])
        .transform((v) => v.toLowerCase().trim() === "true")
        .optional()
        .default(true),
});

// NOWPayments invoice response type
interface NowPaymentsInvoiceResponse {
    id: string;
    order_id: string;
    order_description: string;
    price_amount: number;
    price_currency: string;
    invoice_url: string;
    success_url: string;
    cancel_url: string;
    created_at: string;
    updated_at: string;
}

function getNowPaymentsApiUrl(env: Cloudflare.Env): string {
    const mode =
        env.NOWPAYMENTS_ENV === "production" ? "production" : "sandbox";
    return NOWPAYMENTS_API_URL[mode];
}

export const nowpaymentsRoutes = new Hono<Env>()
    .use("*", auth({ allowApiKey: false, allowSessionCookie: true }))
    .get(
        "/invoice/:pack",
        describeRoute({
            tags: ["Payments"],
            description:
                "Create a NOWPayments crypto invoice for a pollen pack.",
            hide: true,
        }),
        validator("param", invoiceParamsSchema),
        validator("query", redirectQuerySchema),
        async (c) => {
            // Crypto payments are temporarily disabled
            throw new HTTPException(503, {
                message: "Crypto payments are temporarily unavailable",
            });

            // biome-ignore lint/correctness/noUnreachable: Code preserved for future re-enablement
            const user = c.var.auth.requireUser();
            const { pack } = c.req.valid("param");
            const { redirect } = c.req.valid("query");

            const apiKey = c.env.NOWPAYMENTS_API_KEY;
            const baseUrl = getNowPaymentsApiUrl(c.env);

            if (!apiKey) {
                log.error("NOWPAYMENTS_API_KEY not configured");
                throw new HTTPException(500, {
                    message: "Crypto payments not configured",
                });
            }

            const priceAmount = PACK_AMOUNTS[pack];
            const description = PACK_DESCRIPTIONS[pack];

            // Build success/cancel URLs (use request origin for dev)
            const appUrl =
                c.env.ENVIRONMENT === "production"
                    ? "https://enter.pollinations.ai"
                    : new URL(c.req.url).origin;
            const successUrl = `${appUrl}/?payment=success&method=crypto`;
            const cancelUrl = `${appUrl}/?payment=cancelled&method=crypto`;

            // Build IPN callback URL
            const webhookUrl =
                c.env.ENVIRONMENT === "production"
                    ? "https://enter.pollinations.ai/api/webhooks/nowpayments"
                    : `${new URL(c.req.url).origin}/api/webhooks/nowpayments`;

            log.info("Creating invoice", {
                baseUrl,
                pack,
            });

            try {
                const response = await fetch(`${baseUrl}/invoice`, {
                    method: "POST",
                    headers: {
                        "x-api-key": apiKey,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        price_amount: priceAmount,
                        price_currency: "usd",
                        order_id: `${user.id}:${pack}:${Date.now()}`,
                        order_description: description,
                        ipn_callback_url: webhookUrl,
                        success_url: successUrl,
                        cancel_url: cancelUrl,
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    log.error("NOWPayments invoice creation failed: {error}", {
                        error: errorText,
                        status: response.status,
                    });
                    throw new HTTPException(502, {
                        message: "Failed to create crypto invoice",
                    });
                }

                const invoice =
                    (await response.json()) as NowPaymentsInvoiceResponse;

                log.info(
                    "Created NOWPayments invoice for user {userId}: {invoiceId}",
                    {
                        userId: user.id,
                        invoiceId: invoice.id,
                        pack,
                        amount: priceAmount,
                    },
                );

                if (redirect) {
                    return c.redirect(invoice.invoice_url);
                }

                return c.json({
                    redirect: false,
                    url: invoice.invoice_url,
                    invoiceId: invoice.id,
                });
            } catch (error) {
                if (error instanceof HTTPException) throw error;
                log.error("NOWPayments API error: {error}", { error });
                throw new HTTPException(500, {
                    message: "Crypto payment service error",
                });
            }
        },
    );

export type NowPaymentsRoutes = typeof nowpaymentsRoutes;

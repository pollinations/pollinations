/**
 * x402 Crypto Payment Routes
 *
 * Implements USDC payments on Base network using the x402 protocol.
 *
 * MVP: Logs payments for manual crediting via Polar dashboard.
 * TODO: Automate via Polar discount API once we confirm $0 checkout flow.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../middleware/auth.ts";
import { polar } from "../middleware/polar.ts";
import type { Env } from "../env.ts";
import { describeRoute } from "hono-openapi";

// Pollen packs - must match existing Polar products
export const CRYPTO_PACKS = {
    "5": { price: "$5", pollen: 5000 },
    "10": { price: "$10", pollen: 10000 },
    "20": { price: "$20", pollen: 20000 },
    "50": { price: "$50", pollen: 50000 },
} as const;

type PackAmount = keyof typeof CRYPTO_PACKS;

// Extend CloudflareBindings for crypto-specific env vars
declare global {
    interface CloudflareBindings {
        CRYPTO_WALLET_ADDRESS?: string;
    }
}

export const x402Routes = new Hono<Env>()
    .get(
        "/status",
        describeRoute({
            tags: ["Crypto"],
            description: "Check crypto payment status and available packs",
        }),
        (c) => {
            const walletAddress = c.env.CRYPTO_WALLET_ADDRESS;
            const enabled = Boolean(walletAddress);
            const network =
                c.env.ENVIRONMENT === "production" ? "base" : "base-sepolia";

            if (!enabled) {
                return c.json({
                    enabled: false,
                    message: "Crypto payments not configured",
                });
            }
            return c.json({
                enabled: true,
                network,
                walletAddress,
                packs: CRYPTO_PACKS,
            });
        },
    )
    .use("/topup/*", auth({ allowApiKey: true, allowSessionCookie: true }))
    .use("/topup/*", polar)
    .post(
        "/topup/:amount",
        describeRoute({
            tags: ["Crypto"],
            description: "Purchase pollen with USDC via x402 protocol",
        }),
        async (c) => {
            const log = c.get("log");
            const amount = c.req.param("amount") as PackAmount;

            if (!CRYPTO_PACKS[amount]) {
                throw new HTTPException(400, {
                    message: `Invalid amount. Valid: ${Object.keys(CRYPTO_PACKS).join(", ")}`,
                });
            }

            const walletAddress = c.env.CRYPTO_WALLET_ADDRESS;
            if (!walletAddress) {
                throw new HTTPException(503, {
                    message: "Crypto payments not configured",
                });
            }

            const user = c.var.auth.requireUser();
            const pack = CRYPTO_PACKS[amount];
            const paymentHeader = c.req.header("X-PAYMENT");

            if (!paymentHeader) {
                // Return 402 Payment Required with x402 payment details
                const network =
                    c.env.ENVIRONMENT === "production"
                        ? "base"
                        : "base-sepolia";
                return c.json(
                    {
                        paymentRequirements: [
                            {
                                scheme: "exact",
                                network,
                                maxAmountRequired: amount, // USDC amount
                                resource: c.req.url,
                                description: `Purchase ${pack.pollen.toLocaleString()} pollen`,
                                mimeType: "application/json",
                                payTo: walletAddress,
                                maxTimeoutSeconds: 300,
                                asset: "USDC",
                            },
                        ],
                        x402Version: 1,
                    },
                    402,
                );
            }

            // Payment header present - verify and credit automatically
            try {
                const paymentPayload = JSON.parse(atob(paymentHeader));
                log.info(
                    `Processing crypto payment: ${JSON.stringify(paymentPayload)}`,
                );

                // Get the pollen pack meter ID from environment
                const meterId = c.env.POLAR_POLLEN_PACK_METER_ID;
                if (!meterId) {
                    throw new HTTPException(500, {
                        message: "Pollen meter not configured",
                    });
                }

                // Credit pollen using Polar's meter API
                const polarClient = c.var.polar.client;
                await polarClient.events.create({
                    externalCustomerId: user.id,
                    meterId: meterId,
                    value: pack.pollen,
                    metadata: {
                        source: "x402_crypto_payment",
                        amount: amount,
                        timestamp: new Date().toISOString(),
                    },
                });

                log.info(`Credited ${pack.pollen} pollen to user ${user.id}`);

                return c.json({
                    success: true,
                    amount,
                    pollen_credited: pack.pollen,
                    user_id: user.id,
                });
            } catch (error) {
                log.error(`Crypto payment failed: ${error}`);
                throw new HTTPException(500, {
                    message: "Failed to process payment",
                });
            }
        },
    );

export type X402Routes = typeof x402Routes;

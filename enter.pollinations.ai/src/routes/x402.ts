/**
 * x402 Crypto Payment Routes
 *
 * Minimal x402 implementation using x402-hono middleware.
 * Testnet: Base Sepolia + https://x402.org/facilitator (free)
 * Mainnet: Base + CDP facilitator (requires CDP API keys)
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { paymentMiddleware } from "x402-hono";
import { auth } from "../middleware/auth.ts";
import { polar } from "../middleware/polar.ts";
import type { Env } from "../env.ts";
import { describeRoute } from "hono-openapi";

// Extend CloudflareBindings for crypto env var
declare global {
    interface CloudflareBindings {
        CRYPTO_WALLET_ADDRESS?: string;
    }
}

// Pollen packs
const PACKS = {
    "5": 5000,
    "10": 10000,
    "20": 20000,
    "50": 50000,
} as const;

type Amount = keyof typeof PACKS;

export const x402Routes = new Hono<Env>()
    // Status endpoint
    .get("/status", (c) => {
        const wallet = c.env.CRYPTO_WALLET_ADDRESS;
        if (!wallet) return c.json({ enabled: false });

        const isMainnet = c.env.ENVIRONMENT === "production";
        return c.json({
            enabled: true,
            network: isMainnet ? "base" : "base-sepolia",
            wallet,
            packs: PACKS,
        });
    })
    // Auth + Polar middleware
    .use("/topup/*", auth({ allowApiKey: true, allowSessionCookie: true }))
    .use("/topup/*", polar)
    // x402 payment middleware
    .use("/topup/*", async (c, next) => {
        const wallet = c.env.CRYPTO_WALLET_ADDRESS;
        if (!wallet) {
            throw new HTTPException(503, { message: "Crypto not configured" });
        }

        const isMainnet = c.env.ENVIRONMENT === "production";
        const network = isMainnet ? "base" : "base-sepolia";
        const facilitator = isMainnet
            ? "https://api.cdp.coinbase.com/platform/v2/x402"
            : "https://x402.org/facilitator";

        return paymentMiddleware(
            wallet as `0x${string}`,
            {
                "/topup/5": { price: "$5", network },
                "/topup/10": { price: "$10", network },
                "/topup/20": { price: "$20", network },
                "/topup/50": { price: "$50", network },
            },
            { url: facilitator },
        )(c, next);
    })
    // Credit pollen after payment verified
    .post(
        "/topup/:amount",
        describeRoute({
            tags: ["Crypto"],
            description: "Purchase pollen with USDC via x402",
        }),
        async (c) => {
            const amount = c.req.param("amount") as Amount;
            const pollen = PACKS[amount];

            if (!pollen) {
                throw new HTTPException(400, { message: "Invalid amount" });
            }

            const user = c.var.auth.requireUser();
            const log = c.get("log");

            // Credit pollen via Polar
            const response = await c.var.polar.client.events.ingest({
                events: [
                    {
                        name: "pollen_pack_purchase",
                        externalCustomerId: user.id,
                        metadata: {
                            source: "x402",
                            amount,
                            pollen,
                            ts: new Date().toISOString(),
                        },
                    },
                ],
            });

            if (response.inserted !== 1) {
                log.error("Failed to credit pollen");
                throw new HTTPException(500, { message: "Credit failed" });
            }

            log.info(`Credited ${pollen} pollen to ${user.id}`);
            return c.json({ success: true, pollen_credited: pollen });
        },
    );

export type X402Routes = typeof x402Routes;

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authenticateSession } from "../middleware/authenticate.ts";
import { polar } from "../middleware/polar.ts";
import { describeRoute } from "hono-openapi";
import { validator } from "../middleware/validator.ts";
import type { Env } from "../env.ts";
import { nanoid } from "nanoid";
import { z } from "zod";

type TierStatus = "none" | "seed" | "flower" | "nectar";
type ActivatableTier = "seed" | "flower" | "nectar";

// Polar product IDs for each tier
const TIER_PRODUCT_IDS: Record<ActivatableTier, string> = {
    seed: "0137d2e0-c770-4277-ad53-91e892bf3dc9",
    flower: "dbe5a6a7-33f3-449e-9e43-e8c5f9887d7e",
    nectar: "5a275643-18a4-4941-86a4-c16c2226740c",
};

interface TierViewModel {
    status: TierStatus;
    next_refill_at_utc: string;
}

function getTierStatus(userTier: string | null | undefined): TierStatus {
    if (!userTier || userTier === "") return "none";
    const normalized = userTier.toLowerCase();
    if (normalized === "seed") return "seed";
    if (normalized === "flower") return "flower";
    if (normalized === "nectar") return "nectar";
    return "none";
}

function getNextMidnightUTC(): string {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    return tomorrow.toISOString();
}

const activateRequestSchema = z.object({
    target_tier: z.enum(["seed", "flower", "nectar"]),
});

export const tiersRoutes = new Hono<Env>()
    .use("*", authenticateSession)
    .use("*", polar)
    .get(
        "/view",
        describeRoute({
            description: "Get the current user's tier status and daily pollen information.",
            hide: false,
        }),
        async (c) => {
            const { user } = c.var.auth.requireActiveSession();
            
            const viewModel: TierViewModel = {
                status: getTierStatus(user.tier),
                next_refill_at_utc: getNextMidnightUTC(),
            };

            return c.json(viewModel);
        },
    )
    .post(
        "/activate",
        describeRoute({
            description: "Create a Polar checkout session to activate a tier subscription.",
            hide: false,
        }),
        validator("json", activateRequestSchema),
        async (c) => {
            const { user } = c.var.auth.requireActiveSession();
            const { target_tier } = c.req.valid("json");

            // Check rate limit (simple: 3 per hour per user)
            const rateLimitKey = `tier_activate_rate:${user.id}`;
            const currentCount = await c.env.KV.get(rateLimitKey);
            if (currentCount && parseInt(currentCount) >= 3) {
                throw new HTTPException(429, {
                    message: "Rate limit exceeded. Try again later.",
                });
            }

            // Generate nonce for intent verification
            const nonce = nanoid();
            
            // Create Polar checkout session
            const polar = c.var.polar.client;
            const productId = TIER_PRODUCT_IDS[target_tier];
            
            try {
                const checkout = await polar.checkouts.create({
                    externalCustomerId: user.id,
                    customerEmail: user.email,
                    products: [productId],
                    metadata: {
                        target_tier,
                        nonce,
                    },
                });

                // Store intent in KV (TTL: 10 minutes)
                const intent = {
                    target_tier,
                    nonce,
                    created_at: Date.now(),
                };
                await c.env.KV.put(
                    `tier_intent:${user.id}`,
                    JSON.stringify(intent),
                    { expirationTtl: 600 }, // 10 minutes
                );

                // Update rate limit counter
                await c.env.KV.put(rateLimitKey, String(parseInt(currentCount || "0") + 1), {
                    expirationTtl: 3600, // 1 hour
                });

                return c.json({ checkout_url: checkout.url });
            } catch (error) {
                throw new HTTPException(500, {
                    message: "Failed to create checkout session",
                    cause: error,
                });
            }
        },
    );

export type TiersRoutes = typeof tiersRoutes;

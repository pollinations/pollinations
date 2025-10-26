import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../middleware/auth.ts";
import { polar } from "../middleware/polar.ts";
import { describeRoute } from "hono-openapi";
import { validator } from "../middleware/validator.ts";
import type { Env } from "../env.ts";
import { z } from "zod";

type TierStatus = "none" | "seed" | "flower" | "nectar";
type ActivatableTier = "seed" | "flower" | "nectar";

// Get Polar product IDs from environment
function getTierProductId(env: Cloudflare.Env, tier: ActivatableTier): string {
    const key = `POLAR_PRODUCT_ID_${tier.toUpperCase()}`;
    const productId = env[key as keyof Cloudflare.Env];
    if (!productId) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return productId as string;
}

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
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    .use(polar)
    .get(
        "/view",
        describeRoute({
            description:
                "Get the current user's tier status and daily pollen information.",
            hide: false,
        }),
        async (c) => {
            const user = c.var.auth.requireUser();

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
            description:
                "Create a Polar checkout session to activate a tier subscription.",
            hide: false,
        }),
        validator("json", activateRequestSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { target_tier } = c.req.valid("json");

            // Validate user has the required tier before allowing subscription
            // Tiers are granted manually by admins, subscriptions only provide pollen
            const userTier = getTierStatus(user.tier);
            if (userTier !== target_tier) {
                throw new HTTPException(403, {
                    message: `You must have ${target_tier} tier to subscribe. Contact admin for tier upgrade.`,
                });
            }

            // Check rate limit (simple: 3 per hour per user)
            const rateLimitKey = `tier_activate_rate:${user.id}`;
            const currentCount = await c.env.KV.get(rateLimitKey);
            if (currentCount && parseInt(currentCount) >= 3) {
                throw new HTTPException(429, {
                    message: "Rate limit exceeded. Try again later.",
                });
            }

            // Create Polar checkout session
            const polar = c.var.polar.client;
            const productId = getTierProductId(c.env, target_tier);

            try {
                const checkout = await polar.checkouts.create({
                    externalCustomerId: user.id,
                    customerEmail: user.email,
                    products: [productId],
                    metadata: {
                        target_tier,
                    },
                });

                // Update rate limit counter
                await c.env.KV.put(
                    rateLimitKey,
                    String(parseInt(currentCount || "0") + 1),
                    {
                        expirationTtl: 3600, // 1 hour
                    },
                );

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

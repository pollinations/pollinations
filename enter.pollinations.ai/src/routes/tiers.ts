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
    assigned_tier: TierStatus;  // Tier assigned in Cloudflare DB
    active_tier: TierStatus;    // Currently active subscription in Polar
    should_show_activate_button: boolean;  // Show button only if no active subscription
    product_name?: string;
    daily_pollen?: number;
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

function getProductIdFromTier(env: Cloudflare.Env, tier: ActivatableTier): string {
    return getTierProductId(env, tier);
}

function getTierFromProductId(env: Cloudflare.Env, productId: string): TierStatus {
    const seedId = (env as any).POLAR_PRODUCT_ID_SEED;
    const flowerId = (env as any).POLAR_PRODUCT_ID_FLOWER;
    const nectarId = (env as any).POLAR_PRODUCT_ID_NECTAR;
    
    if (productId === seedId) return "seed";
    if (productId === flowerId) return "flower";
    if (productId === nectarId) return "nectar";
    return "none";
}

function shouldShowActivateButton(assigned: TierStatus, active: TierStatus): boolean {
    // Show button only if user has assigned tier but no active subscription
    return assigned !== "none" && active === "none";
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
            description: "Get the current user's tier status and daily pollen information.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const polar = c.var.polar.client;
            
            // Get tier assigned in Cloudflare DB
            const assigned_tier = getTierStatus(user.tier);
            
            // Initialize response
            let active_tier: TierStatus = "none";
            let product_name: string | undefined;
            let daily_pollen: number | undefined;
            let next_refill_at_utc = getNextMidnightUTC(); // Default fallback
            
            try {
                // Get customer state from Polar
                const customerState = await polar.customers.getStateExternal({
                    externalId: user.id,
                });
                
                const activeSubs = customerState.activeSubscriptions || [];
                
                // Find the active subscription (prioritize highest tier if multiple)
                if (activeSubs.length > 0) {
                    // Get the first active subscription
                    const activeSub = activeSubs[0];
                    const activeProductId = activeSub.productId;
                    active_tier = getTierFromProductId(c.env, activeProductId);
                    
                    // Calculate next refill: 24 hours from subscription start (daily pollen refill)
                    // Note: currentPeriodEnd is for billing cycle, not daily refills
                    if (activeSub.currentPeriodStart) {
                        const startDate = new Date(activeSub.currentPeriodStart);
                        const now = new Date();
                        
                        // Calculate how many 24-hour periods have passed
                        const msPerDay = 24 * 60 * 60 * 1000;
                        const msSinceStart = now.getTime() - startDate.getTime();
                        const daysPassed = Math.floor(msSinceStart / msPerDay);
                        
                        // Next refill is at the start of the next 24-hour period
                        const nextRefillDate = new Date(startDate.getTime() + (daysPassed + 1) * msPerDay);
                        next_refill_at_utc = nextRefillDate.toISOString();
                    }
                    
                    // Fetch product details for the active subscription
                    try {
                        const product = await polar.products.get({ id: activeProductId });
                        product_name = product.name;
                        
                        // Extract daily pollen from meter_credit benefit
                        const meterBenefit = product.benefits?.find(
                            (b: any) => b.type === "meter_credit"
                        );
                        if (meterBenefit?.properties && "amount" in meterBenefit.properties) {
                            daily_pollen = (meterBenefit.properties as any).amount;
                        }
                    } catch (productError) {
                        c.get("log").warn("Failed to fetch product details: {error}", { error: productError });
                    }
                }
            } catch (error) {
                // If Polar query fails, assume no active subscription
                c.get("log").error("Failed to check subscription status: {error}", { error });
                active_tier = "none";
            }
            
            // Determine if activate button should be shown
            const should_show_activate_button = shouldShowActivateButton(assigned_tier, active_tier);

            const viewModel: TierViewModel = {
                assigned_tier,
                active_tier,
                should_show_activate_button,
                product_name,
                daily_pollen,
                next_refill_at_utc,
            };

            return c.json(viewModel);
        },
    )
    .post(
        "/activate",
        describeRoute({
            description: "Create a Polar checkout session to activate a tier subscription.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
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

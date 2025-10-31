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

// Central tier definition
const TIERS: readonly ActivatableTier[] = ["seed", "flower", "nectar"] as const;

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
    should_show_activate_button: boolean;  // Show button if no active subscription
    product_name?: string;
    daily_pollen?: number;
    next_refill_at_utc: string;
    has_polar_error: boolean;
}

function getTierStatus(userTier: string | null | undefined): TierStatus {
    const normalized = userTier?.toLowerCase();
    return TIERS.includes(normalized as ActivatableTier) ? normalized as TierStatus : "none";
}

function getTierFromProductId(env: Cloudflare.Env, productId: string): TierStatus {
    const tier = TIERS.find(tier => getTierProductId(env, tier) === productId);
    return tier || "none";
}

function shouldShowActivateButton(assigned: TierStatus, active: TierStatus): boolean {
    // Show button if user has assigned tier but no active subscription
    return assigned !== "none" && active === "none";
}

function getNextMidnightUTC(): string {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    return tomorrow.toISOString();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Minimal Polar product/benefit typing to avoid unsafe any casts
type MeterCreditProperties = { units?: number; amount?: number }; // Polar uses "units", keeping "amount" for backward compat
type MeterCreditBenefit = { type: "meter_credit"; properties?: MeterCreditProperties };
type PolarProductMinimal = {
    name: string;
    benefits?: Array<MeterCreditBenefit | { type: string; properties?: unknown }>;
};

function isMeterCreditBenefit(b: unknown): b is MeterCreditBenefit {
    return !!b && typeof b === "object" && (b as { type?: string }).type === "meter_credit";
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
            const log = c.get("log");
            const user = c.var.auth.requireUser();
            const polar = c.var.polar.client;
            
            // Get tier assigned in Cloudflare DB
            const assigned_tier = getTierStatus(user.tier);
            let active_tier: TierStatus = "none";
            let product_name: string | undefined;
            let daily_pollen: number | undefined;
            let next_refill_at_utc = getNextMidnightUTC(); // Default fallback
            let has_polar_error = false;
            
            try {
                // Get customer state from Polar
                const customerState = await polar.customers.getStateExternal({
                    externalId: user.id,
                });
                
                const activeSubs = customerState.activeSubscriptions || [];
                
                // Find the active subscription (prioritize highest tier if multiple)
                if (activeSubs.length > 0) {
                    const activeSub = activeSubs[0];
                    const activeProductId = activeSub.productId;
                    
                    active_tier = getTierFromProductId(c.env, activeProductId);
                    
                    // Calculate next refill: 24 hours from subscription start
                    if (activeSub.currentPeriodStart) {
                        const startTime = new Date(activeSub.currentPeriodStart).getTime();
                        const daysPassed = Math.floor((Date.now() - startTime) / MS_PER_DAY);
                        next_refill_at_utc = new Date(startTime + (daysPassed + 1) * MS_PER_DAY).toISOString();
                    }
                    
                    // Fetch product details for the active subscription
                    try {
                        const product = (await polar.products.get({ id: activeProductId })) as PolarProductMinimal;
                        product_name = product.name;
                        
                        // Extract daily pollen from meter_credit benefit
                        const meterBenefit = product.benefits?.find(isMeterCreditBenefit);
                        // Polar uses "units" property, but check "amount" as fallback
                        const pollenValue = meterBenefit?.properties?.units ?? meterBenefit?.properties?.amount;
                        
                        if (pollenValue !== undefined) {
                            daily_pollen = pollenValue;
                        }
                    } catch (productError) {
                        log.warn("Failed to fetch product details: {error}", { error: productError });
                    }
                }
            } catch (error) {
                // If Polar query fails, assume no active subscription
                log.error("Failed to check subscription status: {error}", { error });
                active_tier = "none";
                has_polar_error = true;
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
                has_polar_error,
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
            const log = c.get("log");
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
                log.error("Polar checkout failed: {error}", {
                    error,
                });
                throw new HTTPException(500, {
                    message: "Failed to create checkout session",
                });
            }
        },
    );

export type TiersRoutes = typeof tiersRoutes;

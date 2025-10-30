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

// Legacy product IDs (old subscriptions before migration)
const LEGACY_PRODUCT_IDS: Record<string, ActivatableTier> = {
    "19c3291a-e1fa-4a03-a08a-3de9ab84af5d": "seed",
    "c675a78a-d954-4739-bfad-c0c8aa3e5576": "flower",
    "dfe978ca-8e07-41fa-992a-ae19ab96e66c": "nectar",
};

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
    should_show_activate_button: boolean;  // Show button if no active subscription or needs upgrade
    needs_upgrade: boolean;     // True if user has legacy subscription that needs migration
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
    // Check current product IDs first
    const currentTier = TIERS.find(tier => getTierProductId(env, tier) === productId);
    if (currentTier) return currentTier;
    
    // Check legacy product IDs
    return LEGACY_PRODUCT_IDS[productId] || "none";
}

function isLegacyProductId(productId: string): boolean {
    return productId in LEGACY_PRODUCT_IDS;
}

function shouldShowActivateButton(assigned: TierStatus, active: TierStatus, needsUpgrade: boolean): boolean {
    // Show button if user has assigned tier but no active subscription, or if they need to upgrade
    return (assigned !== "none" && active === "none") || needsUpgrade;
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
            let needs_upgrade = false;
            
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
                    
                    // Check if this is a legacy subscription that needs upgrade
                    needs_upgrade = isLegacyProductId(activeProductId);
                    
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
                        
                        // For legacy subscriptions, provide fallback values
                        if (needs_upgrade && active_tier !== "none") {
                            product_name = `${active_tier.charAt(0).toUpperCase() + active_tier.slice(1)} Tier (Legacy)`;
                            // Default pollen values for legacy tiers
                            const legacyPollenAmounts: Record<string, number> = {
                                seed: 10,
                                flower: 15,
                                nectar: 20,
                            };
                            daily_pollen = legacyPollenAmounts[active_tier] || 0;
                        }
                    }
                }
            } catch (error) {
                // If Polar query fails, assume no active subscription
                log.error("Failed to check subscription status: {error}", { error });
                active_tier = "none";
                has_polar_error = true;
            }
            
            // Determine if activate button should be shown
            const should_show_activate_button = shouldShowActivateButton(assigned_tier, active_tier, needs_upgrade);
            

            const viewModel: TierViewModel = {
                assigned_tier,
                active_tier,
                should_show_activate_button,
                needs_upgrade,
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
    )
    .post(
        "/upgrade",
        describeRoute({
            description: "One-click upgrade from legacy subscription to V2 product.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const log = c.get("log");
            const user = c.var.auth.requireUser();
            const polar = c.var.polar.client;

            try {
                // Get customer state to find current subscription
                const customerState = await polar.customers.getStateExternal({
                    externalId: user.id,
                });

                const activeSubs = customerState.activeSubscriptions || [];
                if (activeSubs.length === 0) {
                    throw new HTTPException(400, {
                        message: "No active subscription found to upgrade",
                    });
                }

                // Get the first active subscription
                const currentSub = activeSubs[0];
                const currentProductId = currentSub.productId;
                
                // Determine current tier from product ID
                const currentTier = getTierFromProductId(c.env, currentProductId);
                if (currentTier === "none") {
                    throw new HTTPException(400, {
                        message: "Could not determine tier from current subscription",
                    });
                }

                // Check if already on V2 (not legacy)
                const isLegacy = isLegacyProductId(currentProductId);
                if (!isLegacy) {
                    log.info("User already on V2 subscription");
                    return c.json({ 
                        success: true, 
                        message: "Already on latest subscription",
                        already_upgraded: true,
                    });
                }

                // Get the new V2 product ID for this tier
                const newProductId = getTierProductId(c.env, currentTier);

                log.info("Upgrading subscription: {currentProductId} -> {newProductId}", {
                    currentProductId,
                    newProductId,
                    tier: currentTier,
                    legacySubscriptionId: currentSub.id,
                });

                // Create checkout for new V2 subscription
                // Note: User will need to manually cancel old subscription after activating new one
                // Or it can be bulk-cancelled by admin after migration is complete
                const checkout = await polar.checkouts.create({
                    externalCustomerId: user.id,
                    customerEmail: user.email,
                    products: [newProductId],
                    metadata: {
                        upgrade_from_product: currentProductId,
                        upgrade_from_subscription: currentSub.id,
                        tier: currentTier,
                        is_migration: "true",
                    },
                });
                
                log.info("Created V2 checkout for upgrade: {checkoutId}", {
                    checkoutId: checkout.id,
                });

                return c.json({
                    success: true,
                    checkout_url: checkout.url,
                    tier: currentTier,
                    message: `Upgrade to ${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} V2 - complete the checkout to activate`,
                });
            } catch (error) {
                log.error("Subscription upgrade failed: {error}", { error });
                
                if (error instanceof HTTPException) {
                    throw error;
                }
                
                throw new HTTPException(500, {
                    message: "Failed to upgrade subscription. Please contact support.",
                });
            }
        },
    );

export type TiersRoutes = typeof tiersRoutes;

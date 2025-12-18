import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../middleware/auth.ts";
import { polar } from "../middleware/polar.ts";
import { describeRoute } from "hono-openapi";
import { validator } from "../middleware/validator.ts";
import type { Env } from "../env.ts";
import { z } from "zod";

type TierStatus = "none" | "spore" | "seed" | "flower" | "nectar" | "router";
type ActivatableTier = "spore" | "seed" | "flower" | "nectar" | "router";

// Polar subscription shape (only fields we use)
interface PolarSubscription {
    productId: string;
    status?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    canceledAt?: string | null;
}

// Central tier definition
const TIERS: readonly ActivatableTier[] = [
    "spore",
    "seed",
    "flower",
    "nectar",
    "router",
] as const;

// Get Polar product IDs from environment
function getTierProductId(env: Cloudflare.Env, tier: ActivatableTier): string {
    const key = `POLAR_PRODUCT_TIER_${tier.toUpperCase()}`;
    const productId = env[key as keyof Cloudflare.Env];
    if (!productId) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return productId as string;
}

interface TierViewModel {
    target_tier: TierStatus; // Target tier in Cloudflare DB
    active_tier: TierStatus; // Currently active subscription in Polar
    should_show_activate_button: boolean; // Show button if no active subscription
    active_tier_name?: string; // Name of ACTIVE tier (for TierPanel display)
    target_tier_name?: string; // Name of TARGET tier (for activate button)
    daily_pollen?: number;
    next_refill_at_utc: string;
    has_polar_error: boolean;
    subscription_status?: string; // e.g., "active", "canceled"
    subscription_ends_at?: string; // currentPeriodEnd ISO timestamp
    subscription_canceled_at?: string; // canceledAt ISO timestamp
}

function getTierStatus(userTier: string | null | undefined): TierStatus {
    const normalized = userTier?.toLowerCase();
    return TIERS.includes(normalized as ActivatableTier)
        ? (normalized as TierStatus)
        : "none";
}

function getTierFromProductId(
    env: Cloudflare.Env,
    productId: string,
): TierStatus {
    const tier = TIERS.find(
        (tier) => getTierProductId(env, tier) === productId,
    );
    return tier || "none";
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
type MeterCreditBenefit = {
    type: "meter_credit";
    properties?: MeterCreditProperties;
};
type PolarProductMinimal = {
    name: string;
    benefits?: Array<
        MeterCreditBenefit | { type: string; properties?: unknown }
    >;
};

function isMeterCreditBenefit(b: unknown): b is MeterCreditBenefit {
    return (
        !!b &&
        typeof b === "object" &&
        (b as { type?: string }).type === "meter_credit"
    );
}

const activateRequestSchema = z.object({
    target_tier: z.enum(["spore", "seed", "flower", "nectar", "router"]),
});

export const tiersRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    .use(polar)
    .get(
        "/view",
        describeRoute({
            tags: ["Auth"],
            description:
                "Get the current user's tier status and daily pollen information.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const log = c.get("log");
            const user = c.var.auth.requireUser();

            // Get tier assigned in Cloudflare DB
            log.debug(`User tier from DB: ${user.tier}, email: ${user.email}`);
            const target_tier = getTierStatus(user.tier);
            let active_tier: TierStatus = "none";
            let active_tier_name: string | undefined;
            let daily_pollen: number | undefined;
            let next_refill_at_utc = getNextMidnightUTC(); // Default fallback
            let has_polar_error = false;
            let subscription_status: string | undefined;
            let subscription_ends_at: string | undefined;
            let subscription_canceled_at: string | undefined;

            try {
                // Get customer state from Polar (cached)
                const customerState = await c.var.polar.getCustomerState(
                    user.id,
                );

                const activeSubs = customerState.activeSubscriptions || [];

                // Find the active subscription (prioritize highest tier if multiple)
                if (activeSubs.length > 0) {
                    const activeSub =
                        activeSubs[0] as unknown as PolarSubscription;
                    const activeProductId = activeSub.productId;

                    active_tier = getTierFromProductId(c.env, activeProductId);

                    // Extract subscription status information with safe access
                    subscription_status = activeSub.status ?? undefined;
                    subscription_ends_at =
                        activeSub.currentPeriodEnd ?? undefined;
                    subscription_canceled_at =
                        activeSub.canceledAt ?? undefined;

                    // Warn if data inconsistency detected
                    if (activeSub.canceledAt && !activeSub.currentPeriodEnd) {
                        log.warn("Subscription canceled but missing end date", {
                            userId: user.id,
                        });
                    }

                    // Calculate next refill: 24 hours from subscription start
                    if (activeSub.currentPeriodStart) {
                        const startTime = new Date(
                            activeSub.currentPeriodStart,
                        ).getTime();
                        const daysPassed = Math.floor(
                            (Date.now() - startTime) / MS_PER_DAY,
                        );
                        next_refill_at_utc = new Date(
                            startTime + (daysPassed + 1) * MS_PER_DAY,
                        ).toISOString();
                    }

                    // Fetch product details for the active subscription
                    try {
                        const product = (await c.var.polar.client.products.get({
                            id: activeProductId,
                        })) as PolarProductMinimal;
                        active_tier_name = product.name;

                        // Extract daily pollen from meter_credit benefit
                        const meterBenefit =
                            product.benefits?.find(isMeterCreditBenefit);
                        const pollenValue = meterBenefit?.properties?.units;

                        if (pollenValue !== undefined) {
                            daily_pollen = pollenValue;
                        }
                    } catch (productError) {
                        log.warn("Failed to fetch product details: {error}", {
                            error: productError,
                        });
                    }
                }
            } catch (error) {
                // If Polar query fails, assume no active subscription
                log.error("Failed to check subscription status: {error}", {
                    error,
                });
                active_tier = "none";
                has_polar_error = true;
            }

            // Subscriptions are now auto-created on signup and auto-reactivated on cancellation
            // No manual activation button needed
            const should_show_activate_button = false;
            const target_tier_name: string | undefined = undefined;

            const viewModel: TierViewModel = {
                target_tier,
                active_tier,
                should_show_activate_button,
                active_tier_name,
                target_tier_name,
                daily_pollen,
                next_refill_at_utc,
                has_polar_error,
                subscription_status,
                subscription_ends_at,
                subscription_canceled_at,
            };

            return c.json(viewModel);
        },
    )
    .post(
        "/activate",
        describeRoute({
            tags: ["Auth"],
            description:
                "Create a Polar checkout session to activate a tier subscription.",
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

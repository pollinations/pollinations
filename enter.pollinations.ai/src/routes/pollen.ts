import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../middleware/auth.ts";
import { polar } from "../middleware/polar.ts";
import { describeRoute } from "hono-openapi";
import type { Env } from "../env.ts";

/**
 * Pollen Balance API Route
 * 
 * Provides an endpoint to check the remaining pollen balance for an API key.
 * This allows applications to:
 * - Check balance before making requests
 * - Implement fallback logic when balance is low
 * - Provide better UX by warning users before balance runs out
 * 
 * @see https://github.com/pollinations/pollinations/issues/5892
 */
export const pollenRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: false, allowApiKey: true }))
    .use(polar)
    .get(
        "/balance",
        describeRoute({
            tags: ["API"],
            description: [
                "Get the current pollen balance for the API key.",
                "Returns both tier (free) and pack (purchased) pollen balances.",
                "This endpoint is useful for applications to check balance before making requests",
                "and implement fallback logic when balance is low.",
            ].join(" "),
            responses: {
                200: {
                    description: "Pollen balance information",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    pollen: {
                                        type: "number",
                                        description: "Total available pollen (tier + pack)",
                                    },
                                    tier: {
                                        type: "number",
                                        description: "Free pollen from tier subscription",
                                    },
                                    pack: {
                                        type: "number",
                                        description: "Purchased pollen from packs",
                                    },
                                    account_id: {
                                        type: "string",
                                        description: "User account ID",
                                    },
                                    last_updated: {
                                        type: "string",
                                        format: "date-time",
                                        description: "ISO timestamp of last balance update",
                                    },
                                },
                                required: ["pollen", "tier", "pack", "account_id"],
                            },
                        },
                    },
                },
                401: {
                    description: "Invalid or missing API key",
                },
                402: {
                    description: "Insufficient pollen balance (if balance is 0)",
                },
            },
        }),
        async (c) => {
            const log = c.get("log");
            const user = c.var.auth.requireUser();

            log.debug(`Fetching pollen balance for user: ${user.id}, email: ${user.email}`);

            try {
                // Get customer state from Polar (includes meter balances)
                const customerState = await c.var.polar.getCustomerState(user.id);
                
                // Extract meter balances
                const meters = customerState.meters || [];
                
                // Find tier and pack meters using the configured meter IDs
                // Meter IDs are environment-specific (see client/config.ts)
                const meterIds = c.env.ENVIRONMENT === "production"
                    ? { pollenTierMeterId: "b7f3e925-d6c8-4bc8-b40a-291f2793512e", pollenPackMeterId: "0960354f-1ad5-40ab-93dd-7b1930913a38" }
                    : { pollenTierMeterId: "1593243f-f646-4df2-9f55-30da37cbc3a0", pollenPackMeterId: "9bd156bb-2f2e-4e25-b1c0-1308c076c365" };

                const tierMeter = meters.find((m) => m.meterId === meterIds.pollenTierMeterId);
                const packMeter = meters.find((m) => m.meterId === meterIds.pollenPackMeterId);

                const tierBalance = tierMeter?.balance || 0;
                const packBalance = packMeter?.balance || 0;
                const totalPollen = tierBalance + packBalance;

                log.debug(`Pollen balance - Tier: ${tierBalance}, Pack: ${packBalance}, Total: ${totalPollen}`);

                return c.json({
                    pollen: totalPollen,
                    tier: tierBalance,
                    pack: packBalance,
                    account_id: user.id,
                    last_updated: new Date().toISOString(),
                });
            } catch (error) {
                log.error("Failed to fetch pollen balance: {error}", {
                    error,
                    userId: user.id,
                });

                // If it's a balance-related error, return 402
                if (error instanceof HTTPException && error.status === 402) {
                    throw error;
                }

                // For other errors, return 500
                throw new HTTPException(500, {
                    message: "Failed to fetch pollen balance. Please try again later.",
                });
            }
        },
    );

export type PollenRoutes = typeof pollenRoutes;

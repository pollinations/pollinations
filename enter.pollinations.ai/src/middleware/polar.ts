import { Polar } from "@polar-sh/sdk";
import type { CustomerMeter } from "@polar-sh/sdk/models/components/customermeter.js";
import type { CustomerState } from "@polar-sh/sdk/models/components/customerstate.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { cached } from "@/cache";
import { user as userTable } from "@/db/schema/better-auth.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";

type BalanceCheckResult = {
    selectedMeterId: string;
    selectedMeterSlug: string;
    meters: SimplifiedCustomerMeter[];
};

export type PolarVariables = {
    polar: {
        client: Polar;
        getCustomerState: (userId: string) => Promise<CustomerState>;
        requirePositiveBalance: (
            userId: string,
            message?: string,
        ) => Promise<void>;
        getBalance: (
            userId: string,
        ) => Promise<{ tierBalance: number; packBalance: number }>;
        balanceCheckResult?: BalanceCheckResult;
    };
};

export type PolarEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & PolarVariables;
};

export const polar = createMiddleware<PolarEnv>(async (c, next) => {
    const log = c.get("log").getChild("polar");

    const client = new Polar({
        accessToken: c.env.POLAR_ACCESS_TOKEN,
        server: c.env.POLAR_SERVER,
    });

    const getCustomerState = cached(
        async (userId: string): Promise<CustomerState> => {
            log.info("[POLAR API] getCustomerState for user {userId}", {
                userId,
            });
            try {
                const result = await client.customers.getStateExternal({
                    externalId: userId,
                });
                log.info(
                    "[POLAR API] getCustomerState SUCCESS for user {userId}",
                    { userId },
                );
                return result;
            } catch (error) {
                throw new Error("Failed to get customer state.", {
                    cause: error,
                });
            }
        },
        {
            log,
            ttl: 300, // 5 minutes - only used for subscription/tier lookups, not balance checks
            kv: c.env.KV,
            keyGenerator: (userId) => `polar:customer:state:${userId}`,
        },
    );

    const getCustomerMeters = cached(
        async (userId: string): Promise<CustomerMeter[]> => {
            log.info("[POLAR API] getCustomerMeters for user {userId}", {
                userId,
            });
            try {
                const response = await client.customerMeters.list({
                    externalCustomerId: userId,
                    limit: 100,
                });
                log.info(
                    "[POLAR API] getCustomerMeters SUCCESS - {count} meters for user {userId}",
                    {
                        count: response.result.items.length,
                        userId,
                    },
                );
                return response.result.items;
            } catch (error) {
                log.error(
                    "Failed to get customer meters for user {userId}: {error}",
                    {
                        userId,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        cause: error instanceof Error ? error.cause : undefined,
                    },
                );
                throw new Error("Failed to get customer meters.", {
                    cause: error,
                });
            }
        },
        {
            log,
            ttl: 120, // 2 minutes - local D1 balance is source of truth, this is only for lazy init
            kv: c.env.KV,
            keyGenerator: (userId) => `polar:customer:meters:${userId}`,
        },
    );

    // Get balance with lazy init from Polar if not set
    const getBalance = async (
        userId: string,
    ): Promise<{ tierBalance: number; packBalance: number }> => {
        const db = drizzle(c.env.DB);
        const users = await db
            .select({
                tierBalance: userTable.tierBalance,
                packBalance: userTable.packBalance,
            })
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1);

        let tierBalance = users[0]?.tierBalance;
        let packBalance = users[0]?.packBalance;

        // Lazy init: check Polar if either balance is null OR both are zero
        // This handles: new users (both null), users with only tier set (pack null),
        // and users who got 0 written before fix
        const hasNullBalance = tierBalance == null || packBalance == null;
        const hasBothZero = tierBalance === 0 && packBalance === 0;
        const needsInit = hasNullBalance || hasBothZero;

        if (needsInit) {
            log.info(
                "Checking Polar balances for user {userId} (D1: tier={tierBalance}, pack={packBalance})",
                { userId, tierBalance, packBalance },
            );
            const customerMeters = await getCustomerMeters(userId);
            const tierMeter = customerMeters.find((m) =>
                m.meter.name.toLowerCase().includes("tier"),
            );
            const packMeter = customerMeters.find((m) =>
                m.meter.name.toLowerCase().includes("pack"),
            );
            const polarTier = tierMeter?.balance ?? 0;
            const polarPack = packMeter?.balance ?? 0;

            // Only update D1 if Polar has positive balance
            // Don't write 0 to D1 for new users (NULL) - let webhooks handle initial grant
            if (polarTier + polarPack > 0) {
                tierBalance = polarTier;
                packBalance = polarPack;
                await db
                    .update(userTable)
                    .set({ tierBalance, packBalance })
                    .where(eq(userTable.id, userId));
                log.info(
                    "Synced balances from Polar for user {userId}: tier={tierBalance}, pack={packBalance}",
                    { userId, tierBalance, packBalance },
                );
            } else if (hasNullBalance) {
                // User has NULL balance(s) but Polar also has 0 - keep NULL, let webhooks handle initial grant
                log.debug(
                    "User {userId} has no Polar balance yet, keeping D1 as-is",
                    { userId },
                );
            } else if (hasBothZero) {
                // User has 0/0 in D1 and Polar also has 0 - genuine zero balance
                log.debug(
                    "User {userId} has zero balance in both D1 and Polar",
                    { userId },
                );
            }
        }

        return { tierBalance: tierBalance ?? 0, packBalance: packBalance ?? 0 };
    };

    const requirePositiveBalance = async (userId: string, message?: string) => {
        let balances: { tierBalance: number; packBalance: number };
        try {
            balances = await getBalance(userId);
        } catch (error) {
            log.error("Failed to get balance for user {userId}", {
                userId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw new HTTPException(503, {
                message: "Unable to verify balance. Please try again shortly.",
            });
        }

        const totalBalance = balances.tierBalance + balances.packBalance;

        log.debug(
            "Local pollen balance for user {userId}: tier={tierBalance}, pack={packBalance}, total={totalBalance}",
            {
                userId,
                tierBalance: balances.tierBalance,
                packBalance: balances.packBalance,
                totalBalance,
            },
        );

        if (totalBalance > 0) {
            // Set a simplified balance result for tracking
            c.var.polar.balanceCheckResult = {
                selectedMeterId: "local",
                selectedMeterSlug: "local:combined",
                meters: [
                    {
                        meterId: "local:tier",
                        balance: balances.tierBalance,
                        metadata: { slug: "local:tier", priority: 0 },
                    },
                    {
                        meterId: "local:pack",
                        balance: balances.packBalance,
                        metadata: { slug: "local:pack", priority: 1 },
                    },
                ],
            };
            return;
        }

        // no positive balance
        throw new HTTPException(403, {
            message: message || "Your pollen balance is too low.",
        });
    };

    c.set("polar", {
        client,
        getCustomerState,
        requirePositiveBalance,
        getBalance,
    });

    await next();
});

type SimplifiedCustomerMeter = {
    meterId: string;
    balance: number;
    metadata: { slug: string; priority: number };
};

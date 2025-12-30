import { cached } from "@/cache";
import { Polar } from "@polar-sh/sdk";
import { createMiddleware } from "hono/factory";
import { LoggerVariables } from "@/middleware/logger.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import { CustomerState } from "@polar-sh/sdk/models/components/customerstate.js";
import { HTTPException } from "hono/http-exception";
import { CustomerMeter } from "@polar-sh/sdk/models/components/customermeter.js";
import { drizzle } from "drizzle-orm/d1";
import { user as userTable } from "@/db/schema/better-auth.ts";
import { eq } from "drizzle-orm";

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
            ttl: 1500, // 25 minutes - safe with local pending spend tracking (30 min window)
            kv: c.env.KV,
            keyGenerator: (userId) => `polar:customer:meters:${userId}`,
            staleOnError: true, // Return stale cache on Polar API rate limit (429)
        },
    );

    const requirePositiveBalance = async (userId: string, message?: string) => {
        const db = drizzle(c.env.DB);

        // Check local D1 balance first
        const users = await db
            .select({ pollenBalance: userTable.pollenBalance })
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1);

        if (!users[0]) {
            throw new HTTPException(403, {
                message: "User not found",
            });
        }

        let localBalance = users[0].pollenBalance;

        // Lazy initialization: if null, fetch from Polar and store
        if (localBalance == null) {
            log.info(
                "Initializing local balance for user {userId} from Polar",
                { userId },
            );
            const customerMeters = await getCustomerMeters(userId);
            const totalBalance = customerMeters.reduce(
                (sum, meter) => sum + meter.balance,
                0,
            );
            await db
                .update(userTable)
                .set({ pollenBalance: totalBalance })
                .where(eq(userTable.id, userId));
            localBalance = totalBalance;
            log.info("Initialized local balance for user {userId}: {balance}", {
                userId,
                balance: totalBalance,
            });
        }

        log.debug("Local pollen balance for user {userId}: {balance}", {
            userId,
            balance: localBalance,
        });

        if (localBalance > 0) {
            // Set a simplified balance result for tracking
            c.var.polar.balanceCheckResult = {
                selectedMeterId: "local",
                selectedMeterSlug: "local:combined",
                meters: [
                    {
                        meterId: "local",
                        balance: localBalance,
                        metadata: { slug: "local:combined", priority: 0 },
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
    });

    await next();
});

type SimplifiedCustomerMeter = {
    meterId: string;
    balance: number;
    metadata: { slug: string; priority: number };
};

import { cached } from "@/cache";
import { Polar } from "@polar-sh/sdk";
import { createMiddleware } from "hono/factory";
import { LoggerVariables } from "@/middleware/logger.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import { CustomerState } from "@polar-sh/sdk/models/components/customerstate.js";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { CustomerMeter } from "@polar-sh/sdk/models/components/customermeter.js";
import { getPendingSpend } from "@/events.ts";
import { drizzle } from "drizzle-orm/d1";
import { event } from "@/db/schema/event.ts";
import { and, eq, gte, sql } from "drizzle-orm";

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
            try {
                return await client.customers.getStateExternal({
                    externalId: userId,
                });
            } catch (error) {
                throw new Error("Failed to get customer state.", {
                    cause: error,
                });
            }
        },
        {
            log,
            ttl: 300, // 5 minutes - safe with local pending spend tracking
            kv: c.env.KV,
            keyGenerator: (userId) => `polar:customer:state:${userId}`,
        },
    );

    const getCustomerMeters = cached(
        async (userId: string): Promise<CustomerMeter[]> => {
            log.debug(
                "Fetching customer meters from Polar API for user {userId}",
                { userId },
            );
            try {
                const response = await client.customerMeters.list({
                    externalCustomerId: userId,
                    limit: 100,
                });
                log.debug("Got {count} customer meters for user {userId}", {
                    count: response.result.items.length,
                    userId,
                });
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
            ttl: 300, // 5 minutes - safe with local pending spend tracking
            kv: c.env.KV,
            keyGenerator: (userId) => `polar:customer:meters:${userId}`,
        },
    );

    const getAdjustedSimplifiedMeters = async (userId: string) => {
        const customerMeters = await getCustomerMeters(userId);
        const activeMeters = getSimplifiedMatchingMeters(customerMeters);
        const sortedMeters = sortMetersByDescendingPriority(activeMeters);
        const pendingSpend = await getPendingSpend(drizzle(c.env.DB), userId);

        const { adjustedMeters } = sortedMeters.reduce(
            (acc, meter) => {
                const deduction = Math.min(meter.balance, acc.remainingSpend);
                acc.remainingSpend -= deduction;
                acc.adjustedMeters.push({
                    ...meter,
                    balance: meter.balance - deduction,
                });
                return acc;
            },
            {
                remainingSpend: pendingSpend,
                adjustedMeters: [] as typeof sortedMeters,
            },
        );
    };

    const requirePositiveBalance = async (userId: string, message?: string) => {
        const customerMeters = await getCustomerMeters(userId);
        const activeMeters = getSimplifiedMatchingMeters(customerMeters);
        const sortedMeters = sortMetersByDescendingPriority(activeMeters);

        // Get recent local spend to account for Polar processing delay
        const pendingSpend = await getPendingSpend(drizzle(c.env.DB), userId);

        if (pendingSpend > 0) {
            log.debug("Pending spend from D1: {pendingSpend}", {
                pendingSpend,
            });
        }

        // Adjust meter balances by subtracting recent spend.
        // Note: We deduct from highest-priority meters first, which may not match
        // actual meter usage. This is intentionally conservative - it may briefly
        // over-restrict, but prevents negative balances. Accuracy restores when
        // Polar syncs and cache refreshes.
        let remainingSpend = pendingSpend;
        const adjustedMeters = sortedMeters.map((meter) => {
            const deduction = Math.min(meter.balance, remainingSpend);
            remainingSpend -= deduction;
            return {
                ...meter,
                balance: meter.balance - deduction,
            };
        });

        for (const meter of adjustedMeters) {
            if (meter.balance > 0) {
                c.var.polar.balanceCheckResult = {
                    selectedMeterId: meter.meterId,
                    selectedMeterSlug: meter.metadata.slug,
                    meters: adjustedMeters,
                };
                return;
            }
        }

        // no meter with positive balance was found
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

const MeterMetadataSchema = z.object({
    slug: z.string(),
    priority: z.number(),
});

type MeterMetadata = z.infer<typeof MeterMetadataSchema>;

type SimplifiedCustomerMeter = {
    meterId: string;
    balance: number;
    metadata: MeterMetadata;
};

function getSimplifiedMatchingMeters(
    customerMeters: CustomerMeter[],
): SimplifiedCustomerMeter[] {
    return customerMeters.flatMap((customerMeter) => {
        const metadata = MeterMetadataSchema.safeParse(
            customerMeter.meter?.metadata,
        ).data;
        if (!metadata) return [];
        return [
            {
                meterId: customerMeter.meter.id,
                balance: customerMeter.balance,
                metadata,
            },
        ];
    });
}

function sortMetersByDescendingPriority(
    simplifiedMeters: SimplifiedCustomerMeter[],
): SimplifiedCustomerMeter[] {
    return simplifiedMeters.sort(
        (a, b) => b.metadata.priority - a.metadata.priority,
    );
}

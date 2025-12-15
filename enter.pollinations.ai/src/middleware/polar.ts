import { cached } from "@/cache";
import { Polar } from "@polar-sh/sdk";
import { createMiddleware } from "hono/factory";
import { LoggerVariables } from "@/middleware/logger.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import { CustomerState } from "@polar-sh/sdk/models/components/customerstate.js";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { CustomerMeter } from "@polar-sh/sdk/models/components/customermeter.js";
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
    const log = c.get("log");

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
            try {
                const response = await client.customerMeters.list({
                    externalCustomerId: userId,
                    limit: 100,
                });
                return response.result.items;
            } catch (error) {
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

    // Window for pending spend calculation - should exceed Polar's max processing time
    const PENDING_SPEND_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

    // Get recent spend from local events to account for Polar processing delay.
    // Not cached because D1 is fast (~5-10ms) and we need fresh data.
    // Uses composite index: idx_event_user_billed_created
    const getRecentSpend = async (userId: string): Promise<number> => {
        const db = drizzle(c.env.DB);
        const windowStart = new Date(Date.now() - PENDING_SPEND_WINDOW_MS);
        const result = await db
            .select({
                total: sql<number>`COALESCE(SUM(${event.totalPrice}), 0)`,
            })
            .from(event)
            .where(
                and(
                    eq(event.userId, userId),
                    eq(event.isBilledUsage, true),
                    gte(event.createdAt, windowStart),
                ),
            );
        return result[0]?.total || 0;
    };

    const requirePositiveBalance = async (userId: string, message?: string) => {
        const customerMeters = await getCustomerMeters(userId);
        const activeMeters = getSimplifiedMatchingMeters(customerMeters);
        const sortedMeters = sortMetersByDescendingPriority(activeMeters);

        // Get recent local spend to account for Polar processing delay
        const recentSpend = await getRecentSpend(userId);

        // Adjust meter balances by subtracting recent spend.
        // Note: We deduct from highest-priority meters first, which may not match
        // actual meter usage. This is intentionally conservative - it may briefly
        // over-restrict, but prevents negative balances. Accuracy restores when
        // Polar syncs and cache refreshes.
        let remainingSpend = recentSpend;
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

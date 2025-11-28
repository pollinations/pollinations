import { cached } from "@/cache";
import { Polar } from "@polar-sh/sdk";
import { createMiddleware } from "hono/factory";
import { LoggerVariables } from "@/middleware/logger.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import { CustomerState } from "@polar-sh/sdk/models/components/customerstate.js";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { CustomerMeter } from "@polar-sh/sdk/models/components/customermeter.js";

type BalanceCheckResult = {
    selectedMeterId: string;
    selectedMeterSlug: string;
    meters: SimplifiedCustomerMeter[];
};

// Local balance cache key prefix
const LOCAL_BALANCE_KEY_PREFIX = "polar:local:balance:";
// TTL for local balance cache (5 minutes)
const LOCAL_BALANCE_TTL = 300;
// Threshold to force sync with Polar (when total balance is low)
const SYNC_THRESHOLD = 0.5;

export type PolarVariables = {
    polar: {
        client: Polar;
        getCustomerState: (userId: string) => Promise<CustomerState>;
        requirePositiveBalance: (
            userId: string,
            message?: string,
        ) => Promise<void>;
        decrementBalance: (
            userId: string,
            meterId: string,
            amount: number,
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
            ttl: 60, // 60 seconds (minimum allowed value)
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
            ttl: 60, // 60 seconds (minimum allowed value)
            kv: c.env.KV,
            keyGenerator: (userId) => `polar:customer:meters:${userId}`,
        },
    );

    // Get local balance from KV cache
    const getLocalBalance = async (
        userId: string,
    ): Promise<SimplifiedCustomerMeter[] | null> => {
        try {
            const cached = await c.env.KV.get(
                `${LOCAL_BALANCE_KEY_PREFIX}${userId}`,
                "json",
            );
            return cached as SimplifiedCustomerMeter[] | null;
        } catch {
            return null;
        }
    };

    // Set local balance in KV cache
    const setLocalBalance = async (
        userId: string,
        meters: SimplifiedCustomerMeter[],
    ): Promise<void> => {
        try {
            await c.env.KV.put(
                `${LOCAL_BALANCE_KEY_PREFIX}${userId}`,
                JSON.stringify(meters),
                { expirationTtl: LOCAL_BALANCE_TTL },
            );
        } catch (error) {
            log.warn("Failed to set local balance cache: {error}", { error });
        }
    };

    // Calculate total balance across all meters
    const getTotalBalance = (meters: SimplifiedCustomerMeter[]): number => {
        return meters.reduce((sum, m) => sum + m.balance, 0);
    };

    // Decrement balance for a specific meter in local cache
    const decrementBalance = async (
        userId: string,
        meterId: string,
        amount: number,
    ): Promise<void> => {
        const meters = await getLocalBalance(userId);
        if (!meters) return;

        const meter = meters.find((m) => m.meterId === meterId);
        if (meter) {
            meter.balance = Math.max(0, meter.balance - amount);
            await setLocalBalance(userId, meters);
            log.debug(
                "Decremented balance for meter {meterId} by {amount}, new balance: {balance}",
                {
                    meterId,
                    amount,
                    balance: meter.balance,
                },
            );
        }
    };

    const requirePositiveBalance = async (userId: string, message?: string) => {
        // Try local cache first
        let sortedMeters = await getLocalBalance(userId);
        const totalLocalBalance = sortedMeters
            ? getTotalBalance(sortedMeters)
            : 0;

        // Fetch from Polar if no local cache or balance is low
        if (!sortedMeters || totalLocalBalance <= SYNC_THRESHOLD) {
            log.debug("Syncing balance from Polar (local: {local})", {
                local: totalLocalBalance,
            });
            const customerMeters = await getCustomerMeters(userId);
            const activeMeters = getSimplifiedMatchingMeters(customerMeters);
            sortedMeters = sortMetersByDescendingPriority(activeMeters);
            // Update local cache with fresh data
            await setLocalBalance(userId, sortedMeters);
        }

        for (const meter of sortedMeters) {
            if (meter.balance > 0) {
                c.var.polar.balanceCheckResult = {
                    selectedMeterId: meter.meterId,
                    selectedMeterSlug: meter.metadata.slug,
                    meters: sortedMeters,
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
        decrementBalance,
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

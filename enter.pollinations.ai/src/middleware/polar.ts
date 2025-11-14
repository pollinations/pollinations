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
            ttl: 5, // 5 seconds
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
            ttl: 5, // 5 seconds
            kv: c.env.KV,
            keyGenerator: (userId) => `polar:customer:meters:${userId}`,
        },
    );

    const requirePositiveBalance = async (userId: string, message?: string) => {
        const customerMeters = await getCustomerMeters(userId);
        const activeMeters = getSimplifiedMatchingMeters(customerMeters);
        const sortedMeters = sortMetersByDescendingPriority(activeMeters);

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

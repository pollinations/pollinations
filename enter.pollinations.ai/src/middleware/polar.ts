import { cached } from "@/cache";
import { Polar } from "@polar-sh/sdk";
import { createMiddleware } from "hono/factory";
import { LoggerVariables } from "@/middleware/logger.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import { CustomerState } from "@polar-sh/sdk/models/components/customerstate.js";
import { HTTPException } from "hono/http-exception";

export type PolarVariables = {
    polar: {
        client: Polar;
        getCustomerState: (userId: string) => Promise<CustomerState | null>;
        requirePositiveBalance: (
            userId: string,
            message?: string,
        ) => Promise<void>;
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
        async (userId: string): Promise<CustomerState | null> => {
            try {
                log.info("🔍 [POLAR] Fetching customer state from Polar API: userId={userId}", { userId });
                const state = await client.customers.getStateExternal({
                    externalId: userId,
                });
                log.info("✅ [POLAR] Received customer state: userId={userId} meters={meterCount}", { 
                    userId, 
                    meterCount: state?.activeMeters?.length || 0 
                });
                return state;
            } catch (error) {
                log.error("❌ [POLAR] Failed to get customer state: {error}", { error });
                return null;
            }
        },
        {
            log,
            ttl: 60, // 60 seconds - minimum allowed by Cloudflare KV
            kv: c.env.KV,
            keyGenerator: (userId) => `polar:customer:state:${userId}`,
        },
    );

    const requirePositiveBalance = async (userId: string, message?: string) => {
        // Use cached balance check to avoid Polar API rate limits (300 req/min = 5 req/sec)
        // Cache TTL: 60 seconds (Cloudflare KV minimum) - allows burst traffic while keeping balance reasonably fresh
        // Trade-off: User can overdraft by ~60 seconds of usage (acceptable given low per-request costs)
        
        log.info("🔐 [BALANCE CHECK] Starting for userId={userId}", { userId });
        
        let customerState;
        try {
            customerState = await getCustomerState(userId);
        } catch (error) {
            log.error("❌ [BALANCE CHECK] Failed to get customer state: {error}", { error });
            throw new HTTPException(403, {
                message: message || "Your pollen balance is too low.",
            });
        }
        
        if (!customerState) {
            log.error("❌ [BALANCE CHECK] No customer state returned for userId={userId}", { userId });
            throw new HTTPException(403, {
                message: message || "Your pollen balance is too low.",
            });
        }
        
        // Log detailed meter information
        log.info("📊 [BALANCE CHECK] Customer meters: userId={userId} meters={meters}", {
            userId,
            meters: customerState.activeMeters.map(m => ({
                meterId: m.meterId,
                creditedUnits: m.creditedUnits,
                consumedUnits: m.consumedUnits,
                balance: m.balance,
            }))
        });
        
        // Sum all active meters (supports dual-meter system: TierPollen + PackPollen)
        const totalBalance = customerState.activeMeters.reduce(
            (sum, meter) => sum + (meter.balance || 0),
            0
        ) || 0;
        
        log.info("💰 [BALANCE CHECK] Total balance calculated: userId={userId} totalBalance={totalBalance}", {
            userId,
            totalBalance,
            meterCount: customerState.activeMeters.length
        });
        
        if (totalBalance <= 0) {
            log.warn("⛔ [BALANCE CHECK] DENIED - Insufficient balance: userId={userId} balance={balance}", {
                userId,
                balance: totalBalance
            });
            throw new HTTPException(403, {
                message: message || "Your pollen balance is too low.",
            });
        }
        
        log.info("✅ [BALANCE CHECK] APPROVED - Sufficient balance: userId={userId} balance={balance}", {
            userId,
            balance: totalBalance
        });
    };

    c.set("polar", {
        client,
        getCustomerState,
        requirePositiveBalance,
    });

    await next();
});

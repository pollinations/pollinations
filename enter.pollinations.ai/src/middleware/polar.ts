// Caching removed - see requirePositiveBalance for explanation
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

    // CRITICAL: No caching for balance checks (FIX for Issue #1)
    // Previously cached for 60s which created overdraft window:
    //   - Request at T+0: sees cached balance=100, approved
    //   - Request at T+30: sees cached balance=100, approved  
    //   - Request at T+59: sees cached balance=100, approved
    //   - All 3 requests charge 50 pollen each = 150 total spent from 100 balance
    // Trade-off: More Polar API calls (up to 300/min = 5/sec, well within limits)
    const getCustomerState = async (userId: string): Promise<CustomerState | null> => {
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
    };

    const requirePositiveBalance = async (userId: string, message?: string) => {
        // CRITICAL FIX #1: Direct API call (no cache) prevents overdraft race condition
        // Each request gets fresh balance = financial accuracy guaranteed
        // Polar API rate limit: 300 req/min (5 req/sec) - well within typical usage
        // Our internal rate limit: ~5 req/sec per API key - stays under Polar's limit
        
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

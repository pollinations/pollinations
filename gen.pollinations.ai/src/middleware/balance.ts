import {
    type BalanceCheckResult,
    getUserBalance,
    type UserBalance,
} from "@shared/billing/balance.ts";
import type { LoggerVariables } from "@shared/middleware/logger.ts";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AuthVariables } from "@/middleware/auth.ts";

export type { UserBalance };

export type BalanceVariables = {
    balance: {
        getBalance: (userId: string) => Promise<UserBalance>;
        balanceCheckResult?: BalanceCheckResult;
    };
};

export type BalanceEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & BalanceVariables;
};

export const balance = createMiddleware<BalanceEnv>(async (c, next) => {
    const log = c.get("log").getChild("balance");
    const db = drizzle(c.env.DB);
    const balanceCache = new Map<string, UserBalance>();

    const fetchBalanceWithErrorHandling = async (
        userId: string,
    ): Promise<UserBalance> => {
        const cached = balanceCache.get(userId);
        if (cached) return cached;

        try {
            const userBalance = await getUserBalance(db, userId);
            balanceCache.set(userId, userBalance);
            return userBalance;
        } catch (error) {
            log.error("Failed to get balance for user {userId}", {
                userId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw new HTTPException(503, {
                message: "Unable to verify balance. Please try again shortly.",
            });
        }
    };

    const balanceState: BalanceVariables["balance"] = {
        getBalance: fetchBalanceWithErrorHandling,
    };

    c.set("balance", balanceState);

    await next();
});

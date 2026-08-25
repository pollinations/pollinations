import type {
    BalanceCheckResult,
    UserBalance,
} from "@shared/billing/balance.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";

export type { UserBalance };

export type BalanceVariables = {
    balance: {
        getBalance: (userId: string) => Promise<UserBalance>;
        balanceCheckResult?: BalanceCheckResult;
        billingEstimatePrice?: number;
        billingAuthorizationId?: string;
    };
};

export type BalanceEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & BalanceVariables;
};

export const balance = createMiddleware<BalanceEnv>(async (c, next) => {
    const log = c.get("log").getChild("balance");
    const balanceCache = new Map<string, UserBalance>();

    const fetchBalanceWithErrorHandling = async (
        userId: string,
    ): Promise<UserBalance> => {
        const cached = balanceCache.get(userId);
        if (cached) return cached;

        const authUserId = c.var.auth.user?.id;
        const userBalance = c.var.auth.balances;
        if (authUserId !== userId || !userBalance) {
            log.error("Billing identity is missing balance for user {userId}", {
                userId,
            });
            throw new HTTPException(503, {
                message: "Unable to verify balance. Please try again shortly.",
            });
        }
        balanceCache.set(userId, userBalance);
        return userBalance;
    };

    const balanceState: BalanceVariables["balance"] = {
        getBalance: fetchBalanceWithErrorHandling,
    };

    c.set("balance", balanceState);

    await next();
});

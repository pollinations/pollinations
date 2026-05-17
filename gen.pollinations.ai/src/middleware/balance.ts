import {
    type BalanceCheckResult,
    createBalanceCheckResult,
    getUserBalance,
    hasPositiveBalance,
    hasPositivePaidBalance,
    type UserBalance,
} from "@shared/billing/balance.ts";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";

export type { UserBalance };

export type BalanceVariables = {
    balance: {
        requirePositiveBalance: (
            userId: string,
            message?: string,
        ) => Promise<void>;
        requirePaidBalance: (userId: string, message?: string) => Promise<void>;
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

    const requirePositiveBalance = async (userId: string, message?: string) => {
        const balances = await fetchBalanceWithErrorHandling(userId);

        log.debug(
            "Local pollen balance for user {userId}: tier={tierBalance}, pack={packBalance}",
            {
                userId,
                tierBalance: balances.tierBalance,
                packBalance: balances.packBalance,
            },
        );

        if (hasPositiveBalance(balances)) {
            balanceState.balanceCheckResult =
                createBalanceCheckResult(balances);
            return;
        }

        throw new HTTPException(402, {
            message: message || "Your pollen balance is too low.",
        });
    };

    const requirePaidBalance = async (userId: string, message?: string) => {
        const balances = await fetchBalanceWithErrorHandling(userId);

        log.debug("Paid balance check for user {userId}: pack={packBalance}", {
            userId,
            packBalance: balances.packBalance,
        });

        if (hasPositivePaidBalance(balances)) {
            balanceState.balanceCheckResult = createBalanceCheckResult(
                balances,
                true,
            );
            return;
        }

        throw new HTTPException(402, {
            message:
                message ||
                "This model requires 💳 paid balance. 🌱 Tier balance cannot be used.",
        });
    };

    const balanceState: BalanceVariables["balance"] = {
        requirePositiveBalance,
        requirePaidBalance,
        getBalance: fetchBalanceWithErrorHandling,
    };

    c.set("balance", balanceState);

    await next();
});

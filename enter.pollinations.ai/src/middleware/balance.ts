import {
    type BalanceCheckResult,
    createBalanceCheckResult,
    getAvailableBalance,
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

export { getAvailableBalance };
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

    // Helper to fetch balance with error handling
    const fetchBalanceWithErrorHandling = async (
        userId: string,
    ): Promise<UserBalance> => {
        try {
            return await getUserBalance(db, userId);
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
            "Local pollen balance for user {userId}: tier={tierBalance}, dev={devBalance}, pack={packBalance}",
            {
                userId,
                tierBalance: balances.tierBalance,
                devBalance: balances.devBalance,
                packBalance: balances.packBalance,
            },
        );

        if (hasPositiveBalance(balances)) {
            c.var.balance.balanceCheckResult =
                createBalanceCheckResult(balances);
            return;
        }

        // no positive balance - 402 for all billing/payment issues
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
            c.var.balance.balanceCheckResult = createBalanceCheckResult(
                balances,
                true,
            );
            return;
        }

        // No paid balance available
        throw new HTTPException(402, {
            message:
                message ||
                "This model requires 💳 Top-up Pollen. 🌱 Tier Pollen and 🌻 Dev earnings cannot be used.",
        });
    };

    c.set("balance", {
        requirePositiveBalance,
        requirePaidBalance,
        getBalance: (userId: string) => getUserBalance(db, userId),
    });

    await next();
});

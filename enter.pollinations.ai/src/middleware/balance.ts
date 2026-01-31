import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { user as userTable } from "@/db/schema/better-auth.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";

type BalanceCheckResult = {
    selectedMeterId: string;
    selectedMeterSlug: string;
    balances: Record<string, number>;
};

export type UserBalance = {
    tierBalance: number;
    packBalance: number;
    cryptoBalance: number;
};

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

    // Get balance from D1 only
    // Pack balance is updated via webhooks, tier balance via daily cron
    const getBalance = async (userId: string): Promise<UserBalance> => {
        const users = await db
            .select({
                tierBalance: userTable.tierBalance,
                packBalance: userTable.packBalance,
                cryptoBalance: userTable.cryptoBalance,
            })
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1);

        const user = users[0];
        return {
            tierBalance: user?.tierBalance ?? 0,
            packBalance: user?.packBalance ?? 0,
            cryptoBalance: user?.cryptoBalance ?? 0,
        };
    };

    // Helper to fetch balance with error handling
    const fetchBalanceWithErrorHandling = async (
        userId: string,
    ): Promise<UserBalance> => {
        try {
            return await getBalance(userId);
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

    // Helper to determine selected balance source
    const determineBalanceSource = (
        balances: UserBalance,
        isPaidOnly = false,
    ): { source: string; slug: string } => {
        if (isPaidOnly) {
            // For paid-only: crypto → pack
            if (balances.cryptoBalance > 0) {
                return { source: "crypto", slug: "v1:meter:crypto" };
            }
            return { source: "pack", slug: "v1:meter:pack" };
        }

        // Regular: tier → crypto → pack
        if (balances.tierBalance > 0) {
            return { source: "tier", slug: "v1:meter:tier" };
        }
        if (balances.cryptoBalance > 0) {
            return { source: "crypto", slug: "v1:meter:crypto" };
        }
        return { source: "pack", slug: "v1:meter:pack" };
    };

    const requirePositiveBalance = async (userId: string, message?: string) => {
        const balances = await fetchBalanceWithErrorHandling(userId);
        const totalBalance =
            balances.tierBalance +
            balances.packBalance +
            balances.cryptoBalance;

        log.debug(
            "Local pollen balance for user {userId}: tier={tierBalance}, pack={packBalance}, crypto={cryptoBalance}, total={totalBalance}",
            {
                userId,
                tierBalance: balances.tierBalance,
                packBalance: balances.packBalance,
                cryptoBalance: balances.cryptoBalance,
                totalBalance,
            },
        );

        if (totalBalance > 0) {
            const { source, slug } = determineBalanceSource(balances);
            c.var.balance.balanceCheckResult = {
                selectedMeterId: `local:${source}`,
                selectedMeterSlug: slug,
                balances: {
                    "v1:meter:tier": balances.tierBalance,
                    "v1:meter:crypto": balances.cryptoBalance,
                    "v1:meter:pack": balances.packBalance,
                },
            };
            return;
        }

        // no positive balance - 402 for all billing/payment issues
        throw new HTTPException(402, {
            message: message || "Your pollen balance is too low.",
        });
    };

    const requirePaidBalance = async (userId: string, message?: string) => {
        const balances = await fetchBalanceWithErrorHandling(userId);

        // For paid-only models, only consider crypto + pack balance
        const paidBalance = balances.cryptoBalance + balances.packBalance;

        log.debug(
            "Paid balance check for user {userId}: crypto={cryptoBalance}, pack={packBalance}, paid={paidBalance}",
            {
                userId,
                cryptoBalance: balances.cryptoBalance,
                packBalance: balances.packBalance,
                paidBalance,
            },
        );

        if (paidBalance > 0) {
            const { source, slug } = determineBalanceSource(balances, true);
            c.var.balance.balanceCheckResult = {
                selectedMeterId: `local:${source}`,
                selectedMeterSlug: slug,
                balances: {
                    "v1:meter:tier": 0, // Tier not available for paid-only
                    "v1:meter:crypto": balances.cryptoBalance,
                    "v1:meter:pack": balances.packBalance,
                },
            };
            return;
        }

        // No paid balance available
        throw new HTTPException(402, {
            message:
                message ||
                "This model requires a paid balance. Tier balance cannot be used.",
        });
    };

    c.set("balance", {
        requirePositiveBalance,
        requirePaidBalance,
        getBalance,
    });

    await next();
});

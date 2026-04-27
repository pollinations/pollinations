import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { user as userTable } from "@/db/schema/better-auth.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { UserBalance } from "@/utils/balance-deduction.ts";

export type { UserBalance } from "@/utils/balance-deduction.ts";

type BalanceCheckResult = {
    selectedMeterId: string;
    selectedMeterSlug: string;
    balances: Record<string, number>;
};

/**
 * Get the total available balance across relevant buckets.
 * For paid-only models: pack only (dev_balance is not spendable on paid-only).
 * For regular models: tier + dev + pack (only positive buckets).
 */
export function getAvailableBalance(
    balances: UserBalance,
    isPaidOnly = false,
): number {
    if (isPaidOnly) {
        return Math.max(0, balances.packBalance);
    }
    return (
        Math.max(0, balances.tierBalance) +
        Math.max(0, balances.devBalance) +
        Math.max(0, balances.packBalance)
    );
}

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
    // Pack balance is updated via webhooks, tier balance via hourly cron refill,
    // dev balance via BYOP markup credits in track middleware
    const getBalance = async (userId: string): Promise<UserBalance> => {
        const users = await db
            .select({
                tierBalance: userTable.tierBalance,
                devBalance: userTable.devBalance,
                packBalance: userTable.packBalance,
            })
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1);

        const user = users[0];
        return {
            tierBalance: user?.tierBalance ?? 0,
            devBalance: user?.devBalance ?? 0,
            packBalance: user?.packBalance ?? 0,
        };
    };

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

    // Mirror the priority used by atomicDeductUserBalance:
    // regular: tier → dev → pack
    // paid-only: pack only
    const determineBalanceSource = (
        balances: UserBalance,
        isPaidOnly = false,
    ): { source: string; slug: string } => {
        if (isPaidOnly) {
            return { source: "pack", slug: "v1:meter:pack" };
        }

        if (balances.tierBalance > 0) {
            return { source: "tier", slug: "v1:meter:tier" };
        }
        if (balances.devBalance > 0) {
            return { source: "dev", slug: "v1:meter:dev" };
        }
        return { source: "pack", slug: "v1:meter:pack" };
    };

    const allBalancesMap = (b: UserBalance): Record<string, number> => ({
        "v1:meter:tier": b.tierBalance,
        "v1:meter:dev": b.devBalance,
        "v1:meter:pack": b.packBalance,
    });

    const requirePositiveBalance = async (userId: string, message?: string) => {
        const balances = await fetchBalanceWithErrorHandling(userId);
        // Check each bucket individually — summing would let a negative bucket
        // cancel out a positive one and block admission incorrectly.
        const hasPositiveBalance =
            balances.tierBalance > 0 ||
            balances.devBalance > 0 ||
            balances.packBalance > 0;

        log.debug(
            "Local pollen balance for user {userId}: tier={tierBalance}, dev={devBalance}, pack={packBalance}",
            {
                userId,
                tierBalance: balances.tierBalance,
                devBalance: balances.devBalance,
                packBalance: balances.packBalance,
            },
        );

        if (hasPositiveBalance) {
            const { source, slug } = determineBalanceSource(balances);
            c.var.balance.balanceCheckResult = {
                selectedMeterId: `local:${source}`,
                selectedMeterSlug: slug,
                balances: allBalancesMap(balances),
            };
            return;
        }

        throw new HTTPException(402, {
            message: message || "Your pollen balance is too low.",
        });
    };

    const requirePaidBalance = async (userId: string, message?: string) => {
        const balances = await fetchBalanceWithErrorHandling(userId);

        log.debug(
            "Pack balance check for user {userId}: pack={packBalance}",
            { userId, packBalance: balances.packBalance },
        );

        if (balances.packBalance > 0) {
            const { source, slug } = determineBalanceSource(balances, true);
            c.var.balance.balanceCheckResult = {
                selectedMeterId: `local:${source}`,
                selectedMeterSlug: slug,
                balances: {
                    "v1:meter:tier": 0,
                    "v1:meter:dev": 0,
                    "v1:meter:pack": balances.packBalance,
                },
            };
            return;
        }

        throw new HTTPException(402, {
            message:
                message ||
                "This model requires 💳 Top-up Pollen. 🌱 Tier Pollen and 🌻 Dev earnings cannot be used.",
        });
    };

    c.set("balance", {
        requirePositiveBalance,
        requirePaidBalance,
        getBalance,
    });

    await next();
});

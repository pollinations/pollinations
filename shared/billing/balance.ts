import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { user as userTable } from "../db/better-auth.ts";

export type BalanceCheckResult = {
    selectedMeterId: string;
    selectedMeterSlug: string;
    balances: Record<string, number>;
};

export type UserBalance = {
    tierBalance: number;
    devBalance: number;
    packBalance: number;
};

export type BalanceSource = {
    source: "tier" | "dev" | "pack";
    slug: "v1:meter:tier" | "v1:meter:dev" | "v1:meter:pack";
};

export async function getUserBalance(
    db: DrizzleD1Database,
    userId: string,
): Promise<UserBalance> {
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
}

/**
 * Get the total available balance across relevant buckets.
 * For paid-only models: pack only.
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

export function hasPositiveBalance(balances: UserBalance): boolean {
    return (
        balances.tierBalance > 0 ||
        balances.devBalance > 0 ||
        balances.packBalance > 0
    );
}

export function hasPositivePaidBalance(balances: UserBalance): boolean {
    return balances.packBalance > 0;
}

export function determineBalanceSource(
    balances: UserBalance,
    isPaidOnly = false,
): BalanceSource {
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
}

export function createBalanceCheckResult(
    balances: UserBalance,
    isPaidOnly = false,
): BalanceCheckResult {
    const { source, slug } = determineBalanceSource(balances, isPaidOnly);
    return {
        selectedMeterId: `local:${source}`,
        selectedMeterSlug: slug,
        balances: {
            "v1:meter:tier": isPaidOnly ? 0 : balances.tierBalance,
            "v1:meter:dev": isPaidOnly ? 0 : balances.devBalance,
            "v1:meter:pack": balances.packBalance,
        },
    };
}

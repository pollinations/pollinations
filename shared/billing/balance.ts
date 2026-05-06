import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { user as userTable } from "../db/better-auth.ts";
import {
    type BalanceBucket,
    selectDeductionBucket,
    type UserBalance,
} from "./bucket-selection.ts";

export {
    type BalanceBucket,
    canCoverEstimatedCharge,
    selectDeductionBucket,
    type UserBalance,
} from "./bucket-selection.ts";

export type BalanceCheckResult = {
    selectedMeterId: string;
    selectedMeterSlug: string;
    balances: Record<string, number>;
};

export type BalanceSource = {
    source: BalanceBucket;
    slug: "v1:meter:tier" | "v1:meter:pack";
};

export async function getUserBalance(
    db: DrizzleD1Database,
    userId: string,
): Promise<UserBalance> {
    const users = await db
        .select({
            tierBalance: userTable.tierBalance,
            packBalance: userTable.packBalance,
        })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

    const user = users[0];
    return {
        tierBalance: user?.tierBalance ?? 0,
        packBalance: user?.packBalance ?? 0,
    };
}

/**
 * Get the total positive balance across relevant buckets.
 * For paid-only models: pack only.
 */
export function getAvailableBalance(
    balances: UserBalance,
    isPaidOnly = false,
): number {
    if (isPaidOnly) {
        return Math.max(0, balances.packBalance);
    }
    return (
        Math.max(0, balances.tierBalance) + Math.max(0, balances.packBalance)
    );
}

export function hasPositiveBalance(balances: UserBalance): boolean {
    return balances.tierBalance > 0 || balances.packBalance > 0;
}

export function hasPositivePaidBalance(balances: UserBalance): boolean {
    return balances.packBalance > 0;
}

export function determineBalanceSource(
    balances: UserBalance,
    isPaidOnly = false,
    amount?: number,
): BalanceSource {
    if (typeof amount === "number" && amount > 0) {
        const source = selectDeductionBucket(balances, amount, isPaidOnly);
        return source === "tier"
            ? { source, slug: "v1:meter:tier" }
            : { source, slug: "v1:meter:pack" };
    }

    if (isPaidOnly) {
        return { source: "pack", slug: "v1:meter:pack" };
    }

    if (balances.tierBalance > 0) {
        return { source: "tier", slug: "v1:meter:tier" };
    }
    return { source: "pack", slug: "v1:meter:pack" };
}

export function createBalanceCheckResult(
    balances: UserBalance,
    isPaidOnly = false,
    amount?: number,
): BalanceCheckResult {
    const { source, slug } = determineBalanceSource(
        balances,
        isPaidOnly,
        amount,
    );
    return {
        selectedMeterId: `local:${source}`,
        selectedMeterSlug: slug,
        balances: {
            "v1:meter:tier": isPaidOnly ? 0 : balances.tierBalance,
            "v1:meter:pack": balances.packBalance,
        },
    };
}

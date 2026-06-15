import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { user as userTable } from "../db/better-auth.ts";
import {
    type BalanceBucket,
    selectDeductionBucket,
    type UserBalance,
} from "./bucket-selection.ts";

export type { UserBalance } from "./bucket-selection.ts";

export type BalanceCheckResult = {
    selectedMeterId: string;
    selectedMeterSlug: string;
    balances: Record<string, number>;
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

/**
 * Map a deduction bucket to its meter id/slug pair. The balances sub-object
 * differs per call site, so this returns only the id/slug pair.
 */
export function payerBucketToMeter(bucket: BalanceBucket): {
    selectedMeterId: string;
    selectedMeterSlug: "v1:meter:tier" | "v1:meter:pack";
} {
    return {
        selectedMeterId: `local:${bucket}`,
        selectedMeterSlug:
            bucket === "tier" ? "v1:meter:tier" : "v1:meter:pack",
    };
}

export function createBalanceCheckResult(
    balances: UserBalance,
    isPaidOnly = false,
    amount?: number,
): BalanceCheckResult {
    let source: BalanceBucket;
    if (typeof amount === "number" && amount > 0) {
        source = selectDeductionBucket(balances, amount, isPaidOnly);
    } else if (isPaidOnly) {
        source = "pack";
    } else {
        source = balances.tierBalance > 0 ? "tier" : "pack";
    }
    return {
        ...payerBucketToMeter(source),
        balances: {
            "v1:meter:tier": isPaidOnly ? 0 : balances.tierBalance,
            "v1:meter:pack": balances.packBalance,
        },
    };
}

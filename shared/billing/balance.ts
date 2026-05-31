import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { user as userTable } from "../db/better-auth.ts";
import {
    BALANCE_BUCKET_TO_RAW_LOCAL_METER_ID,
    BALANCE_BUCKET_TO_RAW_METER_SLUG,
    type BalanceBucket,
    type RawLocalMeterId,
    type RawMeterSlug,
    selectDeductionBucket,
    type UserBalance,
} from "./bucket-selection.ts";

export {
    BALANCE_BUCKET_TO_RAW_LOCAL_METER_ID,
    BALANCE_BUCKET_TO_RAW_METER_SLUG,
    type BalanceBucket,
    canCoverEstimatedCharge,
    type RawLocalMeterId,
    type RawMeterSlug,
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
    localId: RawLocalMeterId;
    slug: RawMeterSlug;
};

export async function getUserBalance(
    db: DrizzleD1Database,
    userId: string,
): Promise<UserBalance> {
    const users = await db
        .select({
            rewardBalance: userTable.tierBalance,
            paidBalance: userTable.packBalance,
        })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

    const user = users[0];
    return {
        rewardBalance: user?.rewardBalance ?? 0,
        paidBalance: user?.paidBalance ?? 0,
    };
}

/**
 * Get the total positive balance across relevant buckets.
 * For paid-only models: paid only.
 */
export function getAvailableBalance(
    balances: UserBalance,
    isPaidOnly = false,
): number {
    if (isPaidOnly) {
        return Math.max(0, balances.paidBalance);
    }
    return (
        Math.max(0, balances.rewardBalance) + Math.max(0, balances.paidBalance)
    );
}

export function hasPositiveBalance(balances: UserBalance): boolean {
    return balances.rewardBalance > 0 || balances.paidBalance > 0;
}

export function hasPositivePaidBalance(balances: UserBalance): boolean {
    return balances.paidBalance > 0;
}

function createBalanceSource(source: BalanceBucket): BalanceSource {
    return {
        source,
        localId: BALANCE_BUCKET_TO_RAW_LOCAL_METER_ID[source],
        slug: BALANCE_BUCKET_TO_RAW_METER_SLUG[source],
    };
}

export function determineBalanceSource(
    balances: UserBalance,
    isPaidOnly = false,
    amount?: number,
): BalanceSource {
    if (typeof amount === "number" && amount > 0) {
        const source = selectDeductionBucket(balances, amount, isPaidOnly);
        return createBalanceSource(source);
    }

    if (isPaidOnly) {
        return createBalanceSource("paid");
    }

    if (balances.rewardBalance > 0) {
        return createBalanceSource("reward");
    }
    return createBalanceSource("paid");
}

export function createBalanceCheckResult(
    balances: UserBalance,
    isPaidOnly = false,
    amount?: number,
): BalanceCheckResult {
    const { localId, slug } = determineBalanceSource(
        balances,
        isPaidOnly,
        amount,
    );
    return {
        selectedMeterId: localId,
        selectedMeterSlug: slug,
        balances: {
            "v1:meter:tier": isPaidOnly ? 0 : balances.rewardBalance,
            "v1:meter:pack": balances.paidBalance,
        },
    };
}

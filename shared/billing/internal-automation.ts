import type { DrizzleD1Database } from "drizzle-orm/d1";
import { getUserBalance, type UserBalance } from "./balance.ts";

// The one Pollinations-owned account used by GitHub automation.
export const INTERNAL_AUTOMATION_USER_ID = "LJVtOPiUl0C4uRku8kL8prpp95m8jLnt";

const REFILL_AT_POLLEN = 10;
const QUEST_TARGET_POLLEN = 100;
const PAID_TARGET_POLLEN = 20;

export function isInternalAutomationAccount(userId: string): boolean {
    return userId === INTERNAL_AUTOMATION_USER_ID;
}

/** Refill before preflight, including when the account has reached zero. */
export async function getFundedUserBalance(
    db: DrizzleD1Database,
    d1: D1Database,
    userId: string,
): Promise<UserBalance> {
    const balance = await getUserBalance(db, userId);
    if (!isInternalAutomationAccount(userId)) {
        return balance;
    }

    const refills = [
        {
            bucket: "tier",
            column: "tier_balance",
            title: "Internal automation Quest credit",
            balance: balance.tierBalance,
            target: QUEST_TARGET_POLLEN,
        },
        {
            bucket: "pack",
            column: "pack_balance",
            title: "Internal automation Paid credit",
            balance: balance.packBalance,
            target: PAID_TARGET_POLLEN,
        },
    ].filter(({ balance }) => balance <= REFILL_AT_POLLEN);
    if (refills.length === 0) return balance;

    // D1 batch is a transaction. A concurrent request rechecks the balance
    // after the first refill and cannot record or apply a second grant.
    await d1.batch(
        refills.flatMap(({ bucket, column, title, target }) => {
            const grantId = crypto.randomUUID();
            return [
                d1
                    .prepare(
                        `INSERT INTO rewards (
                id, idempotency_key, user_id, quest_id, title,
                pollen_amount, balance_bucket, earned_at, claimed_at
            )
            SELECT ?, ?, id, NULL, ?,
                ROUND(? - COALESCE(${column}, 0), 8),
                ?, unixepoch(), unixepoch()
            FROM user
            WHERE id = ?
                AND COALESCE(${column}, 0) <= ?`,
                    )
                    .bind(
                        grantId,
                        `internal-automation:${bucket}:${grantId}`,
                        title,
                        target,
                        bucket,
                        userId,
                        REFILL_AT_POLLEN,
                    ),
                d1
                    .prepare(
                        `UPDATE user
            SET ${column} = ROUND(COALESCE(${column}, 0) +
                (SELECT pollen_amount FROM rewards WHERE id = ?), 8)
            WHERE id = ? AND EXISTS (SELECT 1 FROM rewards WHERE id = ?)`,
                    )
                    .bind(grantId, userId, grantId),
            ];
        }),
    );

    return getUserBalance(db, userId);
}

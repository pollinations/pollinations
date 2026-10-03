import type { DrizzleD1Database } from "drizzle-orm/d1";
import { getUserBalance, type UserBalance } from "./balance.ts";

// The one Pollinations-owned account used by GitHub automation.
export const INTERNAL_AUTOMATION_USER_ID = "LJVtOPiUl0C4uRku8kL8prpp95m8jLnt";

const REFILL_BELOW_POLLEN = 5;
const REFILL_TO_POLLEN = 20;

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
    if (
        !isInternalAutomationAccount(userId) ||
        balance.tierBalance + balance.packBalance >= REFILL_BELOW_POLLEN
    ) {
        return balance;
    }

    const grantId = crypto.randomUUID();
    // D1 batch is a transaction. A concurrent request rechecks the balance
    // after the first refill and cannot record or apply a second grant.
    await d1.batch([
        d1
            .prepare(
                `INSERT INTO rewards (
                id, idempotency_key, user_id, quest_id, title,
                pollen_amount, balance_bucket, earned_at, claimed_at
            )
            SELECT ?, ?, id, NULL, 'Internal automation credit',
                ROUND(? - COALESCE(tier_balance, 0) - COALESCE(pack_balance, 0), 8),
                'tier', unixepoch(), unixepoch()
            FROM user
            WHERE id = ?
                AND COALESCE(tier_balance, 0) + COALESCE(pack_balance, 0) < ?`,
            )
            .bind(
                grantId,
                `internal-automation:${grantId}`,
                REFILL_TO_POLLEN,
                userId,
                REFILL_BELOW_POLLEN,
            ),
        d1
            .prepare(
                `UPDATE user
            SET tier_balance = ROUND(COALESCE(tier_balance, 0) +
                (SELECT pollen_amount FROM rewards WHERE id = ?), 8)
            WHERE id = ? AND EXISTS (SELECT 1 FROM rewards WHERE id = ?)`,
            )
            .bind(grantId, userId, grantId),
    ]);

    return getUserBalance(db, userId);
}

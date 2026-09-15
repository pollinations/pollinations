import { env } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { atomicDeductUserBalance } from "@shared/billing/deduction.ts";
import { claimReward, recordRewards } from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "../fixtures.ts";

async function seedUser(
    db: ReturnType<typeof drizzle<typeof schema>>,
    id: string,
) {
    await db
        .insert(userTable)
        .values({
            id,
            email: `${id}@test.com`,
            name: id,
            tier: "seed",
            tierBalance: 0,
            packBalance: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: userTable.id,
            set: { tierBalance: 0, packBalance: 0 },
        });
}

async function claimQuestReward(
    db: ReturnType<typeof drizzle<typeof schema>>,
    userId: string,
    questId: string,
    amount: number,
) {
    const result = await recordRewards(db, [
        {
            idempotencyKey: `quest:${questId}:user:${userId}`,
            userId,
            amount,
            bucket: "tier",
            questId,
            title: `Quest ${questId}`,
        },
    ]);
    const rewardId = result.rewardIds[0];
    if (!rewardId) throw new Error(`Expected reward id for ${questId}`);
    const claimed = await claimReward(db, { rewardId, userId });
    expect(claimed.claimed).toBe(true);
}

test("quest rewards and usage charges keep the ledger at 8-decimal precision", async () => {
    const db = drizzle(env.DB, { schema });
    const userId = "ledger-precision-user";
    await seedUser(db, userId);

    // The real quest lineup: a handful of small rewards plus two larger ones.
    // Each amount is already rounded to the 8-decimal ledger precision, so any
    // drift is purely cumulative float64 error from the balance arithmetic.
    for (const [questId, amount] of [
        ["first_api_key", 0.25],
        ["use_text_model", 0.25],
        ["use_image_model", 0.25],
        ["app_active", 7],
        ["app_listed", 10],
    ]) {
        await claimQuestReward(db, userId, questId, amount);
    }

    // Realistic usage charge, also within ledger precision but not exactly
    // representable in float64.
    const deduction = await atomicDeductUserBalance(db, userId, 16.03);
    expect(deduction.ok).toBe(true);
    expect(deduction.bucket).toBe("tier");

    const balance = await getUserBalance(db, userId);
    // 17.75 - 16.03 must land on exactly 1.72, not a float artifact such as
    // 1.7199999999999989 or 1.7200000000000013.
    expect(balance.tierBalance).toBe(1.72);
    expect(balance.packBalance).toBe(0);
});

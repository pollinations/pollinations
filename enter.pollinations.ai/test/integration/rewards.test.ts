import { env } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import {
    claimReward,
    MAX_REWARD_AMOUNT,
    recordReward,
} from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { rewards, user as userTable } from "@shared/db/better-auth.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

async function seedUser(
    db: ReturnType<typeof drizzle<typeof schema>>,
    id: string,
    tierBalance = 0,
    packBalance = 0,
) {
    await db
        .insert(userTable)
        .values({
            id,
            email: `${id}@test.com`,
            name: id,
            tier: "seed",
            tierBalance,
            packBalance,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: userTable.id,
            set: { tierBalance, packBalance },
        });
}

async function listRewards(
    db: ReturnType<typeof drizzle<typeof schema>>,
    userId: string,
) {
    return await db
        .select()
        .from(rewards)
        .where(sql`${rewards.userId} = ${userId}`);
}

describe("rewards", () => {
    test("records a pending tier reward without crediting balance", async () => {
        const db = drizzle(env.DB, { schema });
        const userId = "reward-user-tier";
        await seedUser(db, userId);

        const result = await recordReward(db, {
            idempotencyKey: "quest:1",
            userId,
            amount: 5,
            bucket: "tier",
            questId: "1",
            title: "Test reward",
        });

        expect(result.recorded).toBe(true);
        expect(result.rewardId).toEqual(expect.any(String));

        const balance = await getUserBalance(db, userId);
        expect(balance.tierBalance).toBe(0);

        const rows = await listRewards(db, userId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            questId: "1",
            title: "Test reward",
            balanceBucket: "tier",
            pollenAmount: 5,
            claimedAt: null,
        });
    });

    test("recording is idempotent and claim credits once", async () => {
        const db = drizzle(env.DB, { schema });
        const userId = "reward-user-idem";
        await seedUser(db, userId);

        const key = `first_image:${userId}`;
        const first = await recordReward(db, {
            idempotencyKey: key,
            userId,
            amount: 0.5,
            bucket: "tier",
            title: "First image",
        });
        const second = await recordReward(db, {
            idempotencyKey: key,
            userId,
            amount: 0.5,
            bucket: "tier",
            title: "First image",
        });

        expect(first.recorded).toBe(true);
        expect(second.recorded).toBe(false);
        expect(await listRewards(db, userId)).toHaveLength(1);

        if (!first.rewardId) throw new Error("Expected reward id");
        const claimed = await claimReward(db, {
            rewardId: first.rewardId,
            userId,
        });
        const duplicateClaim = await claimReward(db, {
            rewardId: first.rewardId,
            userId,
        });

        expect(claimed.claimed).toBe(true);
        expect(claimed.newBalance).toBe(0.5);
        expect(duplicateClaim.claimed).toBe(false);

        const balance = await getUserBalance(db, userId);
        expect(balance.tierBalance).toBe(0.5);
        expect(balance.packBalance).toBe(0);
        expect((await listRewards(db, userId))[0]?.claimedAt).toBeInstanceOf(
            Date,
        );
    });

    test("claims the pack bucket when requested", async () => {
        const db = drizzle(env.DB, { schema });
        const userId = "reward-user-pack";
        await seedUser(db, userId);

        const result = await recordReward(db, {
            idempotencyKey: `manual:${userId}:1`,
            userId,
            amount: 3,
            bucket: "pack",
            title: "Manual reward",
        });
        if (!result.rewardId) throw new Error("Expected reward id");

        const claimed = await claimReward(db, {
            rewardId: result.rewardId,
            userId,
        });

        expect(claimed.claimed).toBe(true);
        const balance = await getUserBalance(db, userId);
        expect(balance.packBalance).toBe(3);
        expect(balance.tierBalance).toBe(0);
    });

    test("rejects non-positive amounts", async () => {
        const db = drizzle(env.DB, { schema });
        const userId = "reward-user-bad";
        await seedUser(db, userId);

        await expect(
            recordReward(db, {
                idempotencyKey: `bad:${userId}`,
                userId,
                amount: 0,
                bucket: "tier",
                title: "Bad reward",
            }),
        ).rejects.toThrow();
    });

    test("rejects amounts above the reward ceiling", async () => {
        const db = drizzle(env.DB, { schema });
        const userId = "reward-user-too-large";
        await seedUser(db, userId);

        await expect(
            recordReward(db, {
                idempotencyKey: `too-large:${userId}`,
                userId,
                amount: MAX_REWARD_AMOUNT + 1,
                bucket: "tier",
                title: "Too large",
            }),
        ).rejects.toThrow(String(MAX_REWARD_AMOUNT));
    });
});

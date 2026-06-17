import { env } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { grantReward } from "@shared/billing/grant-reward.ts";
import { rewardGrants, user as userTable } from "@shared/db/better-auth.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

async function seedUser(
    db: ReturnType<typeof drizzle>,
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

async function countGrants(db: ReturnType<typeof drizzle>, userId: string) {
    const rows = await db
        .select()
        .from(rewardGrants)
        .where(sql`${rewardGrants.userId} = ${userId}`);
    return rows;
}

describe("grantReward", () => {
    test("credits the tier bucket and records a grant row", async () => {
        const db = drizzle(env.DB);
        const userId = "grant-user-tier";
        await seedUser(db, userId);

        const result = await grantReward(db, {
            idempotencyKey: `quest:1:gh:42:role:assignee`,
            userId,
            source: "code_quest",
            amount: 5,
            bucket: "tier",
            questId: "1",
            sourceRef: "pr-7",
        });

        expect(result.granted).toBe(true);
        expect(result.newBalance).toBe(5);

        const balance = await getUserBalance(db, userId);
        expect(balance.tierBalance).toBe(5);

        const rows = await countGrants(db, userId);
        expect(rows).toHaveLength(1);
        expect(rows[0].source).toBe("code_quest");
        expect(rows[0].balanceBucket).toBe("tier");
        expect(rows[0].pollenCredited).toBe(5);
    });

    test("is idempotent: a duplicate idempotency_key does not double-credit", async () => {
        const db = drizzle(env.DB);
        const userId = "grant-user-idem";
        await seedUser(db, userId);

        const key = `first_image:${userId}`;
        const first = await grantReward(db, {
            idempotencyKey: key,
            userId,
            source: "first_image",
            amount: 0.5,
            bucket: "tier",
        });
        const second = await grantReward(db, {
            idempotencyKey: key,
            userId,
            source: "first_image",
            amount: 0.5,
            bucket: "tier",
        });

        expect(first.granted).toBe(true);
        expect(second.granted).toBe(false);

        const balance = await getUserBalance(db, userId);
        expect(balance.tierBalance).toBe(0.5); // credited once, not twice

        const rows = await countGrants(db, userId);
        expect(rows).toHaveLength(1);
    });

    test("credits the pack bucket when requested", async () => {
        const db = drizzle(env.DB);
        const userId = "grant-user-pack";
        await seedUser(db, userId);

        const result = await grantReward(db, {
            idempotencyKey: `manual:${userId}:1`,
            userId,
            source: "manual",
            amount: 3,
            bucket: "pack",
        });

        expect(result.granted).toBe(true);
        const balance = await getUserBalance(db, userId);
        expect(balance.packBalance).toBe(3);
        expect(balance.tierBalance).toBe(0);
    });

    test("rejects non-positive amounts", async () => {
        const db = drizzle(env.DB);
        const userId = "grant-user-bad";
        await seedUser(db, userId);

        await expect(
            grantReward(db, {
                idempotencyKey: `bad:${userId}`,
                userId,
                source: "manual",
                amount: 0,
            }),
        ).rejects.toThrow();
    });
});

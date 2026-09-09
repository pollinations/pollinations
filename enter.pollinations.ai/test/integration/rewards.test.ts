import { env, SELF } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import {
    claimReward,
    MAX_REWARD_AMOUNT,
    recordRewards,
} from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { rewards, user as userTable } from "@shared/db/better-auth.ts";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type Stripe from "stripe";
import { describe, expect } from "vitest";
import questDashboard from "../../../operations/quest-dashboard/worker.js";
import {
    hashGiftCode,
    recordGiftReward,
    refundGiftReward,
} from "../../src/services/gift-rewards.ts";
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

        const result = await recordRewards(db, [
            {
                idempotencyKey: "quest:1",
                userId,
                amount: 5,
                bucket: "tier",
                questId: "1",
                title: "Test reward",
            },
        ]);

        expect(result.recorded).toBe(1);
        expect(result.rewardIds[0]).toEqual(expect.any(String));

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

    test("records more rewards than fit in one D1 insert", async () => {
        const db = drizzle(env.DB, { schema });
        const userId = "reward-user-batched";
        await seedUser(db, userId);

        const result = await recordRewards(
            db,
            Array.from({ length: 12 }, (_, index) => ({
                idempotencyKey: `batched:${userId}:${index}`,
                userId,
                amount: 1,
                bucket: "tier" as const,
                questId: `batched-${index}`,
                title: `Batched reward ${index}`,
            })),
        );

        expect(result.recorded).toBe(12);
        expect(result.rewardIds).toHaveLength(12);
        expect(await listRewards(db, userId)).toHaveLength(12);
    });

    test("recording is idempotent and claim credits once", async () => {
        const db = drizzle(env.DB, { schema });
        const userId = "reward-user-idem";
        await seedUser(db, userId);

        const key = `first_image:${userId}`;
        const first = await recordRewards(db, [
            {
                idempotencyKey: key,
                userId,
                amount: 0.5,
                bucket: "tier",
                title: "First image",
            },
        ]);
        const second = await recordRewards(db, [
            {
                idempotencyKey: key,
                userId,
                amount: 0.5,
                bucket: "tier",
                title: "First image",
            },
        ]);

        expect(first.recorded).toBe(1);
        expect(second.recorded).toBe(0);
        expect(await listRewards(db, userId)).toHaveLength(1);

        const firstRewardId = first.rewardIds[0];
        if (!firstRewardId) throw new Error("Expected reward id");
        const claimed = await claimReward(db, {
            rewardId: firstRewardId,
            userId,
        });
        const duplicateClaim = await claimReward(db, {
            rewardId: firstRewardId,
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

        const result = await recordRewards(db, [
            {
                idempotencyKey: `manual:${userId}:1`,
                userId,
                amount: 3,
                bucket: "pack",
                title: "Manual reward",
            },
        ]);
        const rewardId = result.rewardIds[0];
        if (!rewardId) throw new Error("Expected reward id");

        const claimed = await claimReward(db, {
            rewardId,
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
            recordRewards(db, [
                {
                    idempotencyKey: `bad:${userId}`,
                    userId,
                    amount: 0,
                    bucket: "tier",
                    title: "Bad reward",
                },
            ]),
        ).rejects.toThrow();
    });

    test("rejects amounts above the reward ceiling", async () => {
        const db = drizzle(env.DB, { schema });
        const userId = "reward-user-too-large";
        await seedUser(db, userId);

        await expect(
            recordRewards(db, [
                {
                    idempotencyKey: `too-large:${userId}`,
                    userId,
                    amount: MAX_REWARD_AMOUNT + 1,
                    bucket: "tier",
                    title: "Too large",
                },
            ]),
        ).rejects.toThrow(String(MAX_REWARD_AMOUNT));
    });
});

describe("gift rewards", () => {
    const code = "abcdef1234567890abcdef1234567890";
    const session = {
        payment_status: "paid",
        payment_intent: "pi_reward_gift",
        metadata: { giftCode: code, packKey: "p10" },
    } as Stripe.Checkout.Session;

    test("live quest dashboard excludes gifts from feed, totals and rankings", async () => {
        const db = drizzle(env.DB, { schema });
        await seedUser(db, "gift-private");
        const {
            rewardIds: [rewardId],
        } = await recordGiftReward(env.DB, session);
        await claimReward(db, {
            rewardId,
            userId: "gift-private",
            giftCodeHash: await hashGiftCode(code),
        });
        const response = await questDashboard.fetch(
            new Request("https://quest-dashboard.test/data"),
            { DB: env.DB },
        );
        expect(await response.json()).toMatchObject({
            feed: [],
            agg: [],
            top: [],
            totals: {
                total_earned: 0,
                total_claimed: null,
                total_pollen: null,
                users: 0,
            },
        });
    });

    test("requires payment, records once, and lets only one recipient claim", async () => {
        const db = drizzle(env.DB, { schema });
        await seedUser(db, "gift-a");
        await seedUser(db, "gift-b");
        await expect(
            recordGiftReward(env.DB, { ...session, payment_status: "unpaid" }),
        ).rejects.toThrow();
        const {
            rewardIds: [rewardId],
        } = await recordGiftReward(env.DB, session);
        expect((await recordGiftReward(env.DB, session)).recorded).toBe(0);
        expect(await listRewards(db, "gift-a")).toEqual([]);
        const giftCodeHash = await hashGiftCode(code);
        expect(await hashGiftCode(` ${code.toUpperCase()} `)).toBe(
            giftCodeHash,
        );
        expect(
            (await claimReward(db, { rewardId, userId: "gift-a" })).reward,
        ).toBeNull();
        expect(
            (
                await claimReward(db, {
                    rewardId,
                    userId: "gift-a",
                    giftCodeHash: "wrong",
                })
            ).reward,
        ).toBeNull();
        const claims = await Promise.all(
            ["gift-a", "gift-b"].map((userId) =>
                claimReward(db, { rewardId, userId, giftCodeHash }),
            ),
        );
        expect(claims.filter((result) => result.claimed)).toHaveLength(1);
        const balances = await Promise.all(
            ["gift-a", "gift-b"].map((id) => getUserBalance(db, id)),
        );
        expect(
            balances.reduce(
                (total, balance) => total + (balance.packBalance ?? 0),
                0,
            ),
        ).toBe(10);
        const [row] = await db
            .select()
            .from(rewards)
            .where(eq(rewards.id, rewardId));
        expect(row.questId).toBeNull();
        expect(row.giftCodeHash).not.toBe(code);
        expect(row.claimedAt).not.toBeNull();
        if (!row.userId) throw new Error("Expected recipient");
        expect(
            (
                await claimReward(db, {
                    rewardId,
                    userId: row.userId,
                    giftCodeHash,
                })
            ).claimed,
        ).toBe(false);
        // Deleting the winner must not make this gift available again.
        await db.delete(userTable).where(eq(userTable.id, row.userId));
        await seedUser(db, "gift-c");
        expect(
            (
                await claimReward(db, {
                    rewardId,
                    userId: "gift-c",
                    giftCodeHash,
                })
            ).claimed,
        ).toBe(false);
    });

    test.for([
        false,
        true,
    ])("refund cancels once, claimed=%s", async (claimFirst) => {
        const db = drizzle(env.DB, { schema });
        await seedUser(db, "gift-refund", 7, 20);
        const {
            rewardIds: [rewardId],
        } = await recordGiftReward(env.DB, session);
        const args = {
            rewardId,
            userId: "gift-refund",
            giftCodeHash: await hashGiftCode(code),
        };
        if (claimFirst) await claimReward(db, args);
        await refundGiftReward(env.DB, "pi_reward_gift");
        await refundGiftReward(env.DB, "pi_reward_gift");
        expect((await recordGiftReward(env.DB, session)).recorded).toBe(0);
        expect((await claimReward(db, args)).reward).toBeNull();
        const balance = await getUserBalance(db, "gift-refund");
        expect(balance.packBalance).toBe(20);
        expect(balance.tierBalance).toBe(7);
    });

    test("refund racing a claim leaves no gift credit", async () => {
        const db = drizzle(env.DB, { schema });
        await seedUser(db, "gift-race");
        const {
            rewardIds: [rewardId],
        } = await recordGiftReward(env.DB, session);
        await Promise.all([
            claimReward(db, {
                rewardId,
                userId: "gift-race",
                giftCodeHash: await hashGiftCode(code),
            }),
            refundGiftReward(env.DB, "pi_reward_gift"),
        ]);
        expect((await getUserBalance(db, "gift-race")).packBalance).toBe(0);
    });

    test("private preview does not claim; shared claim endpoint adds it to personal Bonus rewards", async ({
        sessionToken,
        apiKey,
    }) => {
        const db = drizzle(env.DB, { schema });
        const {
            rewardIds: [rewardId],
        } = await recordGiftReward(env.DB, session);
        const url = "http://localhost:3000/api/quests";
        const headers = {
            cookie: `better-auth.session_token=${sessionToken}`,
            "Content-Type": "application/json",
        };
        const previewUrl = `${url}/gifts/preview`;
        for (const unauthorizedHeaders of [
            {},
            { Authorization: `Bearer ${apiKey}` },
        ]) {
            const response = await SELF.fetch(previewUrl, {
                method: "POST",
                headers: {
                    ...unauthorizedHeaders,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ code }),
            });
            expect(response.status).toBe(401);
            await response.text();
        }
        const catalog = await SELF.fetch(`${url}/catalog`);
        expect(await catalog.text()).not.toContain("Pollen gift");
        const before = await SELF.fetch(`${url}/rewards`, { headers });
        expect(await before.text()).not.toContain(rewardId);
        for (let i = 0; i < 2; i++) {
            const preview = await SELF.fetch(previewUrl, {
                method: "POST",
                headers,
                body: JSON.stringify({ code }),
            });
            expect(preview.status).toBe(200);
            expect(await preview.json()).toEqual({
                id: rewardId,
                title: "Pollen gift",
                pollenAmount: 10,
            });
        }
        const [pending] = await db
            .select()
            .from(rewards)
            .where(eq(rewards.id, rewardId));
        expect(pending.userId).toBeNull();
        expect(pending.claimedAt).toBeNull();
        const claim = await SELF.fetch(`${url}/rewards/${rewardId}/claim`, {
            method: "POST",
            headers,
            body: JSON.stringify({ code }),
        });
        expect(claim.status).toBe(200);
        expect(await claim.json()).toMatchObject({
            claimed: true,
            reward: { questId: null },
        });
        const after = await SELF.fetch(`${url}/rewards`, { headers });
        const personal = await after.text();
        expect(personal).toContain(rewardId);
        expect(personal).not.toContain(code);
        expect(personal).not.toContain("giftCodeHash");
        await refundGiftReward(env.DB, "pi_reward_gift");
        const canceled = await SELF.fetch(`${url}/rewards`, { headers });
        expect(await canceled.text()).not.toContain(rewardId);
    });
});

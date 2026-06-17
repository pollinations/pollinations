import { env } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { checkAndGrantQuest } from "@shared/billing/check-and-grant-quest.ts";
import { questDefinitions, user as userTable } from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

// Minimal logger stub matching the Logger surface checkAndGrantQuest uses.
const log = {
    debug() {},
    info() {},
    warn() {},
    error() {},
    trace() {},
    getChild() {
        return log;
    },
} as unknown as Parameters<typeof checkAndGrantQuest>[3]["log"];

const ctx = { environment: "test", log };

async function seedUser(db: ReturnType<typeof drizzle>, id: string) {
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

async function seedDef(
    db: ReturnType<typeof drizzle>,
    overrides: Partial<typeof questDefinitions.$inferInsert> & {
        key: string;
        triggerType: string;
        rewardAmount: number;
    },
) {
    await db
        .insert(questDefinitions)
        .values({
            id: `def-${overrides.key}`,
            title: overrides.key,
            balanceBucket: "tier",
            repeatability: "once",
            active: true,
            ...overrides,
        })
        .onConflictDoNothing();
}

describe("checkAndGrantQuest", () => {
    test("grants a matching active quest and credits the user", async () => {
        const db = drizzle(env.DB);
        const userId = "cq-user-1";
        await seedUser(db, userId);
        await seedDef(db, {
            key: "first_image",
            triggerType: "first_image",
            rewardAmount: 0.5,
        });

        const results = await checkAndGrantQuest(
            db,
            userId,
            "first_image",
            ctx,
        );

        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({ questKey: "first_image", granted: true });

        const balance = await getUserBalance(db, userId);
        expect(balance.tierBalance).toBe(0.5);
    });

    test("is idempotent: re-firing the same trigger does not double-grant", async () => {
        const db = drizzle(env.DB);
        const userId = "cq-user-2";
        await seedUser(db, userId);
        await seedDef(db, {
            key: "first_key",
            triggerType: "key_created",
            rewardAmount: 0.5,
        });

        const first = await checkAndGrantQuest(db, userId, "key_created", ctx);
        const second = await checkAndGrantQuest(db, userId, "key_created", ctx);

        expect(first[0].granted).toBe(true);
        expect(second[0].granted).toBe(false);

        const balance = await getUserBalance(db, userId);
        expect(balance.tierBalance).toBe(0.5); // once, not twice
    });

    test("ignores inactive definitions and unknown triggers", async () => {
        const db = drizzle(env.DB);
        const userId = "cq-user-3";
        await seedUser(db, userId);
        await seedDef(db, {
            key: "disabled_quest",
            triggerType: "first_top_up",
            rewardAmount: 2,
            active: false,
        });

        const matched = await checkAndGrantQuest(
            db,
            userId,
            "first_top_up",
            ctx,
        );
        const unknown = await checkAndGrantQuest(
            db,
            userId,
            "no_such_trigger",
            ctx,
        );

        expect(matched).toHaveLength(0);
        expect(unknown).toHaveLength(0);

        const balance = await getUserBalance(db, userId);
        expect(balance.tierBalance).toBe(0);
    });

    test("credits the pack bucket by default (no explicit balance_bucket)", async () => {
        const db = drizzle(env.DB);
        const userId = "cq-user-default-bucket";
        await seedUser(db, userId);
        // seedDef sets balanceBucket: "tier" by default in this helper, so
        // override it to undefined to exercise the column default ("pack").
        await db
            .insert(questDefinitions)
            .values({
                id: "def-default-bucket",
                key: "default_bucket_quest",
                title: "default bucket",
                triggerType: "first_top_up",
                rewardAmount: 1,
            })
            .onConflictDoNothing();

        const results = await checkAndGrantQuest(
            db,
            userId,
            "first_top_up",
            ctx,
        );

        expect(
            results.some(
                (r) => r.questKey === "default_bucket_quest" && r.granted,
            ),
        ).toBe(true);
        const balance = await getUserBalance(db, userId);
        expect(balance.packBalance).toBe(1);
        expect(balance.tierBalance).toBe(0);
    });

    test("skips non-once repeatability (not yet supported) without granting", async () => {
        const db = drizzle(env.DB);
        const userId = "cq-user-4";
        await seedUser(db, userId);
        await seedDef(db, {
            key: "weekly_streak",
            triggerType: "streak",
            rewardAmount: 1,
            repeatability: "weekly",
        });

        const results = await checkAndGrantQuest(db, userId, "streak", ctx);

        expect(results).toHaveLength(0);
        const balance = await getUserBalance(db, userId);
        expect(balance.tierBalance).toBe(0);
    });
});

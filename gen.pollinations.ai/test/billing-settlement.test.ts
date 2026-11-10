import { env } from "cloudflare:test";
import {
    recordFailedSettlement,
    settleFailedCharge,
    settleFailedCharges,
} from "@shared/billing/settlement.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { billingSettlement } from "@shared/db/billing-settlement.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

const db = drizzle(env.DB);

async function createUser(tierBalance: number) {
    const userId = `settlement-${crypto.randomUUID()}`;
    await db.insert(userTable).values({
        id: userId,
        email: `${userId}@test.local`,
        name: "Settlement Test User",
        tierBalance,
        packBalance: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return userId;
}

async function getUserBalance(userId: string) {
    const [row] = await db
        .select({ tierBalance: userTable.tierBalance })
        .from(userTable)
        .where(eq(userTable.id, userId));
    return row?.tierBalance;
}

async function getSettlement(requestId: string) {
    const [row] = await db
        .select()
        .from(billingSettlement)
        .where(eq(billingSettlement.requestId, requestId));
    return row;
}

function charge(userId: string, totalPrice = 10) {
    return {
        requestId: `req-${crypto.randomUUID()}`,
        userId,
        isBilledUsage: true,
        totalPrice,
    };
}

describe("billing settlement recovery", () => {
    it("charges a recorded failure exactly once", async () => {
        const userId = await createUser(100);
        const failed = charge(userId);

        expect(await recordFailedSettlement(db, failed)).toBe(true);
        expect((await getSettlement(failed.requestId))?.status).toBe("pending");

        const first = await settleFailedCharge(db, failed.requestId);
        expect(first.outcome).toBe("settled");
        expect(await getUserBalance(userId)).toBe(90);

        const row = await getSettlement(failed.requestId);
        expect(row?.status).toBe("settled");
        expect(row?.billedPrice).toBe(10);
        expect(row?.attempts).toBe(1);

        const second = await settleFailedCharge(db, failed.requestId);
        expect(second.outcome).toBe("skipped");
        expect(await getUserBalance(userId)).toBe(90);
    });

    it("keeps one row when the same request is reported twice", async () => {
        const userId = await createUser(100);
        const failed = charge(userId);

        expect(await recordFailedSettlement(db, failed)).toBe(true);
        expect(await recordFailedSettlement(db, failed)).toBe(false);

        const rows = await db
            .select()
            .from(billingSettlement)
            .where(eq(billingSettlement.requestId, failed.requestId));
        expect(rows).toHaveLength(1);
    });

    it("retries a failed attempt once the payer exists", async () => {
        // The first attempt cannot debit a missing row and must stay retryable
        // instead of turning into a silent settled record.
        const userId = `settlement-${crypto.randomUUID()}`;
        const failed = charge(userId, 5);
        await recordFailedSettlement(db, failed);

        const first = await settleFailedCharge(db, failed.requestId);
        expect(first.outcome).toBe("failed");
        expect(await getSettlement(failed.requestId)).toMatchObject({
            status: "failed",
            attempts: 1,
        });

        await db.insert(userTable).values({
            id: userId,
            email: `${userId}@test.local`,
            name: "Settlement Test User",
            tierBalance: 20,
            packBalance: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const second = await settleFailedCharge(db, failed.requestId);
        expect(second.outcome).toBe("settled");
        expect(await getUserBalance(userId)).toBe(15);
        expect((await getSettlement(failed.requestId))?.attempts).toBe(2);
    });

    it("settles a charge at most once when two retries race", async () => {
        const userId = await createUser(30);
        const failed = charge(userId, 7);
        await recordFailedSettlement(db, failed);

        const results = await Promise.all([
            settleFailedCharge(db, failed.requestId),
            settleFailedCharge(db, failed.requestId),
        ]);

        expect(results.filter((r) => r.outcome === "settled")).toHaveLength(1);
        expect(results.filter((r) => r.outcome === "skipped")).toHaveLength(1);
        expect(await getUserBalance(userId)).toBe(23);
    });

    it("drains recorded failures oldest first", async () => {
        const userId = await createUser(50);
        const older = charge(userId, 3);
        const newer = charge(userId, 4);
        await recordFailedSettlement(db, older);
        await recordFailedSettlement(db, newer);

        const counts = await settleFailedCharges(db, { limit: 10 });
        expect(counts.settled).toBe(2);
        expect(await getUserBalance(userId)).toBe(43);
    });
});

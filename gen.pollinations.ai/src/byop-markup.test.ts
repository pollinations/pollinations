import { env } from "cloudflare:test";
import {
    atomicCreditUserBalance,
    getUserBalances,
} from "@shared/billing/deduction.ts";
import { BYOP_MARKUP_PCT, computeDevCredit } from "@shared/billing/markup.ts";
import {
    handleBalanceDeduction,
    resolveDevMarkup,
} from "@shared/billing/track-helpers.ts";
import {
    apikey as apikeyTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

const db = drizzle(env.DB);

async function setupPayerAndDev({
    payerTier = "spore",
    devTier = "seed",
} = {}) {
    const suffix = crypto.randomUUID();
    const payerId = `payer-${suffix}`;
    const devId = `dev-${suffix}`;
    const pkId = `pk_markup_${suffix}`;

    await db.insert(userTable).values([
        {
            id: payerId,
            email: `${payerId}@test.local`,
            name: payerId,
            tier: payerTier,
            tierBalance: 2,
            devBalance: 0,
            packBalance: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            id: devId,
            email: `${devId}@test.local`,
            name: devId,
            tier: devTier,
            tierBalance: 0,
            devBalance: 0,
            packBalance: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ]);

    await db.insert(apikeyTable).values({
        id: pkId,
        userId: devId,
        name: "markup-app",
        prefix: "pk",
        key: `hashed-${pkId}`,
        enabled: true,
        metadata: JSON.stringify({ byopEnabled: true }),
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    return { payerId, devId, pkId };
}

describe("BYOP markup", () => {
    it("computes the dev credit from the baseline price", () => {
        expect(computeDevCredit(0)).toBe(0);
        expect(computeDevCredit(-1)).toBe(0);
        expect(computeDevCredit(4)).toBeCloseTo(4 * BYOP_MARKUP_PCT, 10);
    });

    it("resolves markup only for enabled publishable app keys and eligible payer tiers", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();

        const resolved = await resolveDevMarkup(db, pkId, 4, payerId);
        expect(resolved).toEqual({
            devUserId: devId,
            devCredit: 4 * BYOP_MARKUP_PCT,
            markupPct: BYOP_MARKUP_PCT,
        });

        expect(await resolveDevMarkup(db, pkId, 4, devId)).toBeNull();

        await db
            .update(userTable)
            .set({ tier: "seed" })
            .where(sql`${userTable.id} = ${payerId}`);
        expect(await resolveDevMarkup(db, pkId, 4, payerId)).toBeNull();

        await db
            .update(userTable)
            .set({ tier: "spore" })
            .where(sql`${userTable.id} = ${payerId}`);
        await db
            .update(apikeyTable)
            .set({ metadata: JSON.stringify({ byopEnabled: false }) })
            .where(sql`${apikeyTable.id} = ${pkId}`);
        expect(await resolveDevMarkup(db, pkId, 4, payerId)).toBeNull();
    });

    it("does not resolve markup for app owners below seed tier", async () => {
        const { payerId, pkId } = await setupPayerAndDev({
            devTier: "spore",
        });

        expect(await resolveDevMarkup(db, pkId, 4, payerId)).toBeNull();
    });

    it("credits dev_balance and bills payer baseline plus markup", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();

        const { markup } = await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice: 1,
            userId: payerId,
            byopClientKeyId: pkId,
        });

        expect(markup?.devUserId).toBe(devId);
        expect(markup?.devCredit).toBeCloseTo(BYOP_MARKUP_PCT, 10);

        expect((await getUserBalances(db, payerId)).tierBalance).toBeCloseTo(
            2 - 1 - BYOP_MARKUP_PCT,
            10,
        );
        const devBalances = await getUserBalances(db, devId);
        expect(devBalances.devBalance).toBeCloseTo(BYOP_MARKUP_PCT, 10);
        expect(devBalances.packBalance).toBe(0);
    });

    it("bills baseline only when markup is not eligible", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev({
            payerTier: "flower",
        });

        const { markup } = await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice: 1,
            userId: payerId,
            byopClientKeyId: pkId,
        });

        expect(markup).toBeNull();
        expect((await getUserBalances(db, payerId)).tierBalance).toBe(1);
        expect((await getUserBalances(db, devId)).devBalance).toBe(0);
    });

    it("does not credit or deduct for unbilled requests", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();

        const { markup } = await handleBalanceDeduction({
            db,
            isBilledUsage: false,
            totalPrice: 1,
            userId: payerId,
            byopClientKeyId: pkId,
        });

        expect(markup).toBeNull();
        expect((await getUserBalances(db, payerId)).tierBalance).toBe(2);
        expect((await getUserBalances(db, devId)).devBalance).toBe(0);
    });

    it("reverts dev credit when payer deduction fails", async () => {
        const { devId, pkId } = await setupPayerAndDev();

        await expect(
            handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 1,
                userId: "missing-payer-row",
                byopClientKeyId: pkId,
            }),
        ).rejects.toThrow(/affected 0 rows/);

        expect((await getUserBalances(db, devId)).devBalance).toBe(0);
    });

    it("returns ok=false when crediting a missing user", async () => {
        const { ok, newBalance } = await atomicCreditUserBalance(
            db,
            "missing-credit-user",
            "dev",
            1,
        );

        expect(ok).toBe(false);
        expect(newBalance).toBeNull();
    });
});

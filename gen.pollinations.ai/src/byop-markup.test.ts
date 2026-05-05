import { env } from "cloudflare:test";
import {
    atomicCreditUserBalance,
    getUserBalances,
} from "@shared/billing/deduction.ts";
import { computeDevCredit, MARKUP_PCT } from "@shared/billing/markup.ts";
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
import { checkBalance } from "@/utils/generation-access.ts";

const db = drizzle(env.DB);

function fakeStatsEnv(price: number): CloudflareBindings {
    return {
        DB: env.DB,
        KV: {
            get: async () => ({
                value: {
                    data: [{ model: "openai", avg_cost_usd: price }],
                },
                ttl: 3600,
            }),
            put: async () => undefined,
        } as unknown as KVNamespace,
    } as CloudflareBindings;
}

function fakeLog() {
    return {
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
    };
}

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
        metadata: JSON.stringify({ earningsEnabled: true }),
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    return { payerId, devId, pkId };
}

describe("BYOP markup", () => {
    it("computes the dev credit from the baseline price", () => {
        expect(computeDevCredit(0)).toBe(0);
        expect(computeDevCredit(-1)).toBe(0);
        expect(computeDevCredit(4)).toBeCloseTo(4 * MARKUP_PCT, 10);
    });

    it("resolves markup only for enabled publishable app keys with earnings enabled", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();

        const resolved = await resolveDevMarkup(db, pkId, 4, payerId);
        expect(resolved).toEqual({
            devUserId: devId,
            devCredit: 4 * MARKUP_PCT,
            markupPct: MARKUP_PCT,
        });

        expect(await resolveDevMarkup(db, pkId, 4, devId)).toBeNull();

        await db
            .update(apikeyTable)
            .set({ metadata: JSON.stringify({ earningsEnabled: false }) })
            .where(sql`${apikeyTable.id} = ${pkId}`);
        expect(await resolveDevMarkup(db, pkId, 4, payerId)).toBeNull();
    });

    it("resolves markup for app owners on any tier", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev({
            devTier: "spore",
        });

        expect(await resolveDevMarkup(db, pkId, 4, payerId)).toEqual({
            devUserId: devId,
            devCredit: 4 * MARKUP_PCT,
            markupPct: MARKUP_PCT,
        });
    });

    it("credits creator tier balance when payer spends tier balance", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();

        const { markup } = await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice: 1,
            userId: payerId,
            byopClientKeyId: pkId,
        });

        expect(markup?.devUserId).toBe(devId);
        expect(markup?.devCredit).toBeCloseTo(MARKUP_PCT, 10);

        expect((await getUserBalances(db, payerId)).tierBalance).toBeCloseTo(
            2 - 1 - MARKUP_PCT,
            10,
        );
        const creatorBalances = await getUserBalances(db, devId);
        expect(creatorBalances.tierBalance).toBeCloseTo(MARKUP_PCT, 10);
        expect(creatorBalances.packBalance).toBe(0);
    });

    it("credits creator pack balance when payer spends pack balance", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();
        await db
            .update(userTable)
            .set({ tierBalance: 0.5, packBalance: 2 })
            .where(sql`${userTable.id} = ${payerId}`);

        const { markup } = await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice: 1,
            userId: payerId,
            byopClientKeyId: pkId,
        });

        expect(markup?.devUserId).toBe(devId);
        expect(markup?.devCredit).toBeCloseTo(MARKUP_PCT, 10);

        const payerBalances = await getUserBalances(db, payerId);
        expect(payerBalances.tierBalance).toBeCloseTo(0.5, 10);
        expect(payerBalances.packBalance).toBeCloseTo(2 - 1 - MARKUP_PCT, 10);

        const creatorBalances = await getUserBalances(db, devId);
        expect(creatorBalances.tierBalance).toBe(0);
        expect(creatorBalances.packBalance).toBeCloseTo(MARKUP_PCT, 10);
    });

    it("bills baseline plus markup for any payer tier", async () => {
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

        expect(markup?.devUserId).toBe(devId);
        expect(markup?.devCredit).toBeCloseTo(MARKUP_PCT, 10);
        expect((await getUserBalances(db, payerId)).tierBalance).toBeCloseTo(
            1 - MARKUP_PCT,
            10,
        );
        expect((await getUserBalances(db, devId)).tierBalance).toBeCloseTo(
            MARKUP_PCT,
            10,
        );
    });

    it("includes markup in preflight user balance checks", async () => {
        const { payerId, pkId } = await setupPayerAndDev();

        await expect(
            checkBalance(
                {
                    auth: {
                        user: { id: payerId },
                        apiKey: {
                            id: "sk-test",
                            byopClientKeyId: pkId,
                            pollenBalance: null,
                        },
                    },
                    balance: {
                        getBalance: async () => ({
                            tierBalance: 1,
                            packBalance: 0,
                        }),
                        requirePositiveBalance: async () => undefined,
                        requirePaidBalance: async () => undefined,
                    },
                    model: { requested: "openai", resolved: "openai" },
                    log: fakeLog(),
                } as never,
                fakeStatsEnv(1),
            ),
        ).rejects.toThrow(/1\.2500 pollen/);
    });

    it("requires one bucket to cover the full estimated charge in preflight", async () => {
        const { payerId, pkId } = await setupPayerAndDev();

        await expect(
            checkBalance(
                {
                    auth: {
                        user: { id: payerId },
                        apiKey: {
                            id: "sk-test",
                            byopClientKeyId: pkId,
                            pollenBalance: null,
                        },
                    },
                    balance: {
                        getBalance: async () => ({
                            tierBalance: 0.75,
                            packBalance: 0.75,
                        }),
                        requirePositiveBalance: async () => undefined,
                        requirePaidBalance: async () => undefined,
                    },
                    model: { requested: "openai", resolved: "openai" },
                    log: fakeLog(),
                } as never,
                fakeStatsEnv(1),
            ),
        ).rejects.toThrow(/available balance is 0\.7500/);
    });

    it("includes markup in preflight API key budget checks", async () => {
        const { payerId, pkId } = await setupPayerAndDev();

        await expect(
            checkBalance(
                {
                    auth: {
                        user: { id: payerId },
                        apiKey: {
                            id: "sk-test",
                            byopClientKeyId: pkId,
                            pollenBalance: 1,
                        },
                    },
                    balance: {
                        getBalance: async () => ({
                            tierBalance: 2,
                            packBalance: 0,
                        }),
                        requirePositiveBalance: async () => undefined,
                        requirePaidBalance: async () => undefined,
                    },
                    model: { requested: "openai", resolved: "openai" },
                    log: fakeLog(),
                } as never,
                fakeStatsEnv(1),
            ),
        ).rejects.toThrow(/API key budget too low/);
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
        expect((await getUserBalances(db, devId)).tierBalance).toBe(0);
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

        expect((await getUserBalances(db, devId)).tierBalance).toBe(0);
    });

    it("returns ok=false when crediting a missing user", async () => {
        const { ok, newBalance } = await atomicCreditUserBalance(
            db,
            "missing-credit-user",
            "tier",
            1,
        );

        expect(ok).toBe(false);
        expect(newBalance).toBeNull();
    });
});

import { env } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { atomicCreditUserBalance } from "@shared/billing/deduction.ts";
import { computeDevCredit, MARKUP_PCT } from "@shared/billing/markup.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import {
    handleBalanceDeduction,
    resolveDevMarkup,
} from "@shared/billing/track-helpers.ts";
import { COMMUNITY_MODEL_REWARD_RATE } from "@shared/community-endpoints.ts";
import {
    apikey as apikeyTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import {
    getRegistryModelDefinition,
    type ModelName,
} from "@shared/registry/registry.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { checkBalance } from "@/utils/generation-access.ts";

const db = drizzle(env.DB);

function fakeStatsEnv(price: number, model = "openai"): CloudflareBindings {
    return {
        DB: env.DB,
        KV: {
            get: async () => ({
                value: {
                    data: [{ model, avg_cost_usd: price }],
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

function testModel(model: ModelName = "openai") {
    return {
        requested: model,
        resolved: model,
        definition: getRegistryModelDefinition(model),
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

async function createBalanceUser(
    prefix: string,
    balances = { tier: 0, pack: 0 },
) {
    const userId = `${prefix}-${crypto.randomUUID()}`;
    await db.insert(userTable).values({
        id: userId,
        email: `${userId}@test.local`,
        name: userId,
        tier: "spore",
        tierBalance: balances.tier,
        packBalance: balances.pack,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return userId;
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
            markupRate: MARKUP_PCT,
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
            markupRate: MARKUP_PCT,
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

        expect((await getUserBalance(db, payerId)).tierBalance).toBeCloseTo(
            2 - 1 - MARKUP_PCT,
            10,
        );
        const creatorBalances = await getUserBalance(db, devId);
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

        const payerBalances = await getUserBalance(db, payerId);
        expect(payerBalances.tierBalance).toBeCloseTo(0.5, 10);
        expect(payerBalances.packBalance).toBeCloseTo(2 - 1 - MARKUP_PCT, 10);

        const creatorBalances = await getUserBalance(db, devId);
        expect(creatorBalances.tierBalance).toBe(0);
        expect(creatorBalances.packBalance).toBeCloseTo(MARKUP_PCT, 10);
    });

    it("bills baseline plus markup without a payer-tier gate", async () => {
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
        expect((await getUserBalance(db, payerId)).tierBalance).toBeCloseTo(
            1 - MARKUP_PCT,
            10,
        );
        expect((await getUserBalance(db, devId)).tierBalance).toBeCloseTo(
            MARKUP_PCT,
            10,
        );
    });

    it("allows regular preflight when one bucket is above the model estimate", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: {
                    id: "sk-test",
                    pollenBalance: 2,
                },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 1,
                    packBalance: 2,
                }),
            },
            model: testModel(),
            log: fakeLog(),
        } as unknown as Parameters<typeof checkBalance>[0];

        await checkBalance(vars, {
            ...fakeStatsEnv(1.25),
            DB: {
                prepare: () => {
                    throw new Error("DB should not be used in preflight");
                },
            } as unknown as D1Database,
        } as CloudflareBindings);

        expect(vars.balance.balanceCheckResult?.balances).toEqual({
            "v1:meter:tier": 1,
            "v1:meter:pack": 2,
        });
    });

    it("rejects regular preflight when neither bucket is above the model estimate", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: {
                    id: "sk-test",
                    pollenBalance: 2,
                },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 1,
                    packBalance: 1,
                }),
            },
            model: testModel(),
            log: fakeLog(),
        } as unknown as Parameters<typeof checkBalance>[0];

        await expect(checkBalance(vars, fakeStatsEnv(1))).rejects.toMatchObject(
            {
                status: 402,
            },
        );
    });

    it("uses positive balance as the fallback when model estimate is zero", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: { id: "sk-test", pollenBalance: 2 },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 0,
                    packBalance: 0.01,
                }),
            },
            model: testModel(),
            log: fakeLog(),
        } as unknown as Parameters<typeof checkBalance>[0];

        await checkBalance(vars, fakeStatsEnv(0));

        expect(vars.balance.balanceCheckResult?.balances).toEqual({
            "v1:meter:tier": 0,
            "v1:meter:pack": 0.01,
        });
    });

    it("requires paid-only preflight to have pack balance above the model estimate", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: { id: "sk-test", pollenBalance: 2 },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 10,
                    packBalance: 1,
                }),
            },
            model: testModel("llama-maverick"),
            log: fakeLog(),
        } as unknown as Parameters<typeof checkBalance>[0];

        await expect(
            checkBalance(vars, fakeStatsEnv(1, "llama-maverick")),
        ).rejects.toMatchObject({
            status: 402,
        });
    });

    it("rejects finite API key budgets that are not above the model estimate", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: { id: "sk-test", pollenBalance: 1 },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 10,
                    packBalance: 10,
                }),
            },
            model: testModel(),
            log: fakeLog(),
        } as unknown as Parameters<typeof checkBalance>[0];

        await expect(checkBalance(vars, fakeStatsEnv(1))).rejects.toMatchObject(
            {
                status: 402,
            },
        );
    });

    it("uses the baseline estimate for BYOP API key budget preflight", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: {
                    id: "sk-test",
                    byopClientKeyId: "pk-test",
                    pollenBalance: 1.1,
                },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 10,
                    packBalance: 10,
                }),
            },
            model: testModel(),
            log: fakeLog(),
        } as unknown as Parameters<typeof checkBalance>[0];

        await checkBalance(vars, {
            ...fakeStatsEnv(1),
            DB: {
                prepare: () => {
                    throw new Error("DB should not be used in preflight");
                },
            } as unknown as D1Database,
        } as CloudflareBindings);
    });

    it("uses the baseline estimate for BYOP user balance preflight", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: {
                    id: "sk-test",
                    byopClientKeyId: "pk-test",
                    pollenBalance: 10,
                },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 1.1,
                    packBalance: 0,
                }),
            },
            model: testModel(),
            log: fakeLog(),
        } as unknown as Parameters<typeof checkBalance>[0];

        await checkBalance(vars, {
            ...fakeStatsEnv(1),
            DB: {
                prepare: () => {
                    throw new Error("DB should not be used in preflight");
                },
            } as unknown as D1Database,
        } as CloudflareBindings);
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
        expect((await getUserBalance(db, payerId)).tierBalance).toBe(2);
        expect((await getUserBalance(db, devId)).tierBalance).toBe(0);
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

        expect((await getUserBalance(db, devId)).tierBalance).toBe(0);
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

    it("returns a rounded billedPrice that matches what the ledger was charged", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();

        const totalPrice = 1.23456789;
        const { markup, billedPrice } = await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice,
            userId: payerId,
            byopClientKeyId: pkId,
        });

        expect(markup).not.toBeNull();
        // billedPrice is totalPrice + devCredit, snapped to ledger precision.
        expect(billedPrice).toBe(
            roundPollenLedgerAmount(totalPrice + (markup?.devCredit ?? 0)),
        );

        // Dev credit lands on the ledger at the same precision.
        const creditBalance = (await getUserBalance(db, devId)).tierBalance;
        expect(creditBalance).toBe(
            roundPollenLedgerAmount(markup?.devCredit ?? 0),
        );
    });

    it("credits a community model owner without increasing the payer bill", async () => {
        const { payerId } = await setupPayerAndDev();
        const ownerId = await createBalanceUser("community-owner");

        const { communityModelReward, billedPrice } =
            await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 1,
                userId: payerId,
                communityModelReward: {
                    userId: ownerId,
                    modelId: "community/owner/model",
                    rewardRate: COMMUNITY_MODEL_REWARD_RATE,
                },
            });

        expect(billedPrice).toBe(1);
        expect(communityModelReward).toEqual({
            userId: ownerId,
            rewardRate: COMMUNITY_MODEL_REWARD_RATE,
            credit: COMMUNITY_MODEL_REWARD_RATE,
        });
        expect((await getUserBalance(db, payerId)).tierBalance).toBeCloseTo(
            1,
            10,
        );
        expect((await getUserBalance(db, ownerId)).tierBalance).toBeCloseTo(
            COMMUNITY_MODEL_REWARD_RATE,
            10,
        );
    });

    it("can credit BYOP and community model rewards on the same generation", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();
        const ownerId = await createBalanceUser("community-owner");

        const { markup, communityModelReward, billedPrice } =
            await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 1,
                userId: payerId,
                byopClientKeyId: pkId,
                communityModelReward: {
                    userId: ownerId,
                    modelId: "community/owner/model",
                    rewardRate: COMMUNITY_MODEL_REWARD_RATE,
                },
            });

        expect(markup?.devCredit).toBeCloseTo(MARKUP_PCT, 10);
        expect(communityModelReward?.credit).toBeCloseTo(
            COMMUNITY_MODEL_REWARD_RATE,
            10,
        );
        expect(billedPrice).toBe(1 + MARKUP_PCT);
        expect((await getUserBalance(db, payerId)).tierBalance).toBeCloseTo(
            2 - 1 - MARKUP_PCT,
            10,
        );
        expect((await getUserBalance(db, devId)).tierBalance).toBeCloseTo(
            MARKUP_PCT,
            10,
        );
        expect((await getUserBalance(db, ownerId)).tierBalance).toBeCloseTo(
            COMMUNITY_MODEL_REWARD_RATE,
            10,
        );
    });

    it("credits a community model owner for their own request", async () => {
        const ownerId = await createBalanceUser("community-owner", {
            tier: 2,
            pack: 0,
        });

        const { communityModelReward, billedPrice } =
            await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 1,
                userId: ownerId,
                communityModelReward: {
                    userId: ownerId,
                    modelId: "community/owner/model",
                    rewardRate: COMMUNITY_MODEL_REWARD_RATE,
                },
            });

        expect(billedPrice).toBe(1);
        expect(communityModelReward).toEqual({
            userId: ownerId,
            rewardRate: COMMUNITY_MODEL_REWARD_RATE,
            credit: COMMUNITY_MODEL_REWARD_RATE,
        });
        expect((await getUserBalance(db, ownerId)).tierBalance).toBeCloseTo(
            2 - 1 + COMMUNITY_MODEL_REWARD_RATE,
            10,
        );
    });
});

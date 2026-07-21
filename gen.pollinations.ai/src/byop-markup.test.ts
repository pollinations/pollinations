import { env } from "cloudflare:test";
import { authenticateApiKeyRequest } from "@shared/auth/api-key.ts";
import { getUserBalance } from "@shared/billing/balance.ts";
import {
    resolveCreatorPayout,
    settleGeneration,
} from "@shared/billing/generation-settlement.ts";
import { computeDevCredit, MARKUP_PCT } from "@shared/billing/markup.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
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

function settleGenerationOnce(
    params: Omit<Parameters<typeof settleGeneration>[0], "d1" | "settlementId">,
) {
    return settleGeneration({
        d1: env.DB,
        settlementId: crypto.randomUUID(),
        ...params,
    });
}

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

async function setupPayerAndDev() {
    const suffix = crypto.randomUUID();
    const payerId = `payer-${suffix}`;
    const devId = `dev-${suffix}`;
    const pkId = `pk_markup_${suffix}`;

    await db.insert(userTable).values([
        {
            id: payerId,
            email: `${payerId}@test.local`,
            name: payerId,
            tierBalance: 2,
            packBalance: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            id: devId,
            email: `${devId}@test.local`,
            name: devId,
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

        const resolved = await resolveCreatorPayout(db, pkId, 4, payerId);
        expect(resolved).toEqual({
            kind: "creator",
            recipientUserId: devId,
            amount: 4 * MARKUP_PCT,
            rate: MARKUP_PCT,
        });

        expect(await resolveCreatorPayout(db, pkId, 4, devId)).toBeNull();

        await db
            .update(apikeyTable)
            .set({ metadata: JSON.stringify({ earningsEnabled: false }) })
            .where(sql`${apikeyTable.id} = ${pkId}`);
        expect(await resolveCreatorPayout(db, pkId, 4, payerId)).toBeNull();
    });

    it("credits creator Quest Pollen when payer spends Quest Pollen", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();

        const settlement = await settleGenerationOnce({
            isBilledUsage: true,
            baseCharge: 1,
            payerUserId: payerId,
            creatorKeyId: pkId,
        });
        const creatorPayout = settlement.payouts[0];

        expect(creatorPayout?.recipientUserId).toBe(devId);
        expect(creatorPayout?.amount).toBeCloseTo(MARKUP_PCT, 10);

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

        const settlement = await settleGenerationOnce({
            isBilledUsage: true,
            baseCharge: 1,
            payerUserId: payerId,
            creatorKeyId: pkId,
        });
        const creatorPayout = settlement.payouts[0];

        expect(creatorPayout?.recipientUserId).toBe(devId);
        expect(creatorPayout?.amount).toBeCloseTo(MARKUP_PCT, 10);

        const payerBalances = await getUserBalance(db, payerId);
        expect(payerBalances.tierBalance).toBeCloseTo(0.5, 10);
        expect(payerBalances.packBalance).toBeCloseTo(2 - 1 - MARKUP_PCT, 10);

        const creatorBalances = await getUserBalance(db, devId);
        expect(creatorBalances.tierBalance).toBe(0);
        expect(creatorBalances.packBalance).toBeCloseTo(MARKUP_PCT, 10);
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

    it("includes known creator markup in API key budget preflight", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: {
                    id: "sk-test",
                    byopClientKeyId: "pk-test",
                    creatorEarningsEnabled: true,
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

        await expect(checkBalance(vars, fakeStatsEnv(1))).rejects.toMatchObject(
            { status: 402 },
        );
    });

    it("exposes active creator earnings to generation preflight", async () => {
        const { payerId, pkId } = await setupPayerAndDev();
        const childKeyId = `byop-child-${crypto.randomUUID()}`;
        await db.insert(apikeyTable).values({
            id: childKeyId,
            userId: payerId,
            key: `hashed-${childKeyId}`,
            byopClientKeyId: pkId,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const result = await authenticateApiKeyRequest({
            request: new Request("https://gen.test", {
                headers: { Authorization: "Bearer sk_test" },
            }),
            env: { DB: env.DB },
            client: {
                api: {
                    verifyApiKey: async () => ({
                        valid: true,
                        key: { id: childKeyId, userId: payerId },
                    }),
                },
            },
        });

        expect(result?.apiKey.creatorEarningsEnabled).toBe(true);
    });

    it("includes known creator markup in user balance preflight", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: {
                    id: "sk-test",
                    byopClientKeyId: "pk-test",
                    creatorEarningsEnabled: true,
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

        await expect(checkBalance(vars, fakeStatsEnv(1))).rejects.toMatchObject(
            { status: 402 },
        );
    });

    it("does not credit or deduct for unbilled requests", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();

        const settlement = await settleGenerationOnce({
            isBilledUsage: false,
            baseCharge: 1,
            payerUserId: payerId,
            creatorKeyId: pkId,
        });

        expect(settlement.payouts).toEqual([]);
        expect((await getUserBalance(db, payerId)).tierBalance).toBe(2);
        expect((await getUserBalance(db, devId)).tierBalance).toBe(0);
    });

    it("reverts dev credit when payer deduction fails", async () => {
        const { devId, pkId } = await setupPayerAndDev();

        await expect(
            settleGenerationOnce({
                isBilledUsage: true,
                baseCharge: 1,
                payerUserId: "missing-payer-row",
                creatorKeyId: pkId,
            }),
        ).rejects.toThrow(/dependencies missing/);

        expect((await getUserBalance(db, devId)).tierBalance).toBe(0);
    });

    it("returns a rounded payer charge that matches what the ledger was charged", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();

        const totalPrice = 1.23456789;
        const settlement = await settleGenerationOnce({
            isBilledUsage: true,
            baseCharge: totalPrice,
            payerUserId: payerId,
            creatorKeyId: pkId,
        });
        const creatorPayout = settlement.payouts[0];

        expect(creatorPayout).toBeDefined();
        expect(settlement.payerCharge).toBe(
            roundPollenLedgerAmount(totalPrice + (creatorPayout?.amount ?? 0)),
        );

        // Dev credit lands on the ledger at the same precision.
        const creditBalance = (await getUserBalance(db, devId)).tierBalance;
        expect(creditBalance).toBe(
            roundPollenLedgerAmount(creatorPayout?.amount ?? 0),
        );
    });

    it("credits a community model owner without increasing the payer bill", async () => {
        const { payerId } = await setupPayerAndDev();
        const ownerId = await createBalanceUser("community-owner");

        const settlement = await settleGenerationOnce({
            isBilledUsage: true,
            baseCharge: 1,
            payerUserId: payerId,
            supplierPayout: {
                userId: ownerId,
                rate: COMMUNITY_MODEL_REWARD_RATE,
            },
        });
        const supplierPayout = settlement.payouts[0];

        expect(settlement.payerCharge).toBe(1);
        expect(supplierPayout).toEqual({
            kind: "supplier",
            recipientUserId: ownerId,
            rate: COMMUNITY_MODEL_REWARD_RATE,
            amount: COMMUNITY_MODEL_REWARD_RATE,
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

        const settlement = await settleGenerationOnce({
            isBilledUsage: true,
            baseCharge: 1,
            payerUserId: payerId,
            creatorKeyId: pkId,
            supplierPayout: {
                userId: ownerId,
                rate: COMMUNITY_MODEL_REWARD_RATE,
            },
        });
        const creatorPayout = settlement.payouts.find(
            (payout) => payout.kind === "creator",
        );
        const supplierPayout = settlement.payouts.find(
            (payout) => payout.kind === "supplier",
        );

        expect(creatorPayout?.amount).toBeCloseTo(MARKUP_PCT, 10);
        expect(supplierPayout?.amount).toBeCloseTo(
            COMMUNITY_MODEL_REWARD_RATE,
            10,
        );
        expect(settlement.payerCharge).toBe(1 + MARKUP_PCT);
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

        const settlement = await settleGenerationOnce({
            isBilledUsage: true,
            baseCharge: 1,
            payerUserId: ownerId,
            supplierPayout: {
                userId: ownerId,
                rate: COMMUNITY_MODEL_REWARD_RATE,
            },
        });
        const supplierPayout = settlement.payouts[0];

        expect(settlement.payerCharge).toBe(1);
        expect(supplierPayout).toEqual({
            kind: "supplier",
            recipientUserId: ownerId,
            rate: COMMUNITY_MODEL_REWARD_RATE,
            amount: COMMUNITY_MODEL_REWARD_RATE,
        });
        expect((await getUserBalance(db, ownerId)).tierBalance).toBeCloseTo(
            2 - 1 + COMMUNITY_MODEL_REWARD_RATE,
            10,
        );
    });

    it("settles the same server-generated settlement id only once", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();
        const settlementId = crypto.randomUUID();
        const input = {
            d1: env.DB,
            settlementId,
            isBilledUsage: true,
            baseCharge: 1,
            payerUserId: payerId,
            creatorKeyId: pkId,
        };

        const [first, retry] = await Promise.all([
            settleGeneration(input),
            settleGeneration(input),
        ]);

        expect(retry).toEqual(first);
        expect((await getUserBalance(db, payerId)).tierBalance).toBeCloseTo(
            2 - 1 - MARKUP_PCT,
            10,
        );
        expect((await getUserBalance(db, devId)).tierBalance).toBeCloseTo(
            MARKUP_PCT,
            10,
        );
    });

    it("clamps a one-request API key budget overrun to zero", async () => {
        const { payerId } = await setupPayerAndDev();
        const apiKeyId = `soft-budget-${crypto.randomUUID()}`;
        await db.insert(apikeyTable).values({
            id: apiKeyId,
            userId: payerId,
            key: `hashed-${apiKeyId}`,
            pollenBalance: 0.1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await settleGenerationOnce({
            isBilledUsage: true,
            baseCharge: 1,
            payerUserId: payerId,
            apiKeyId,
            apiKeyPollenBalance: 0.1,
        });

        const [key] = await db
            .select({ pollenBalance: apikeyTable.pollenBalance })
            .from(apikeyTable)
            .where(sql`${apikeyTable.id} = ${apiKeyId}`);
        expect(key?.pollenBalance).toBe(0);
    });
});

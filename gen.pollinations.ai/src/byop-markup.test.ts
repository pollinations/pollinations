import { env } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { atomicCreditUserBalance } from "@shared/billing/deduction.ts";
import {
    byopClientAllowsMarkup,
    computeDevCredit,
    MARKUP_PCT,
    withByopMarkup,
} from "@shared/billing/markup.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import {
    handleBalanceDeduction,
    resolveDevMarkup,
} from "@shared/billing/track-helpers.ts";
import {
    COMMUNITY_MODEL_REWARD_RATE,
    communityEndpointPrices,
    communityModelDefinition,
} from "@shared/community-endpoints.ts";
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
import {
    getDefinedRequestEstimate,
    getEstimatedPrice,
} from "@/utils/model-stats.ts";

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

function preflightVars({
    model = testModel(),
    tierBalance,
    packBalance,
    pollenBalance,
    apiKey = {},
}: {
    model?: ReturnType<typeof testModel> | Record<string, unknown>;
    tierBalance: number;
    packBalance: number;
    pollenBalance: number;
    apiKey?: Record<string, unknown>;
}) {
    const user = { id: "preflight-payer", tier: "seed" };
    return {
        auth: {
            user,
            balances: { tierBalance, packBalance },
            apiKey: {
                id: "sk-test",
                rawKey: "sk_test",
                pollenBalance,
                ...apiKey,
            },
            requireUser: () => user,
            requireModelAccess: () => undefined,
        },
        balance: {},
        model,
        log: fakeLog(),
    } as unknown as Parameters<typeof checkBalance>[0];
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
        expect(withByopMarkup(1, false)).toBe(1);
        expect(withByopMarkup(1, true)).toBe(1 + MARKUP_PCT);
        expect(withByopMarkup(0, true)).toBe(0);
    });

    it("allows BYOP markup only for a live pk_ with earnings, not self-spend", () => {
        const client = {
            userId: "dev",
            prefix: "pk",
            enabled: true,
            expiresAt: null,
            metadata: { earningsEnabled: true },
        };
        expect(byopClientAllowsMarkup(client, "payer")).toBe(true);
        expect(byopClientAllowsMarkup(client, "dev")).toBe(false);
        expect(
            byopClientAllowsMarkup(
                { ...client, metadata: { earningsEnabled: false } },
                "payer",
            ),
        ).toBe(false);
        expect(
            byopClientAllowsMarkup({ ...client, prefix: "sk" }, "payer"),
        ).toBe(false);
        expect(
            byopClientAllowsMarkup({ ...client, enabled: false }, "payer"),
        ).toBe(false);
        expect(
            byopClientAllowsMarkup(
                { ...client, expiresAt: new Date(0) },
                "payer",
            ),
        ).toBe(false);
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

    it("credits creator Quest Pollen when payer spends Quest Pollen", async () => {
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

    it("allows regular preflight when one bucket is above the model estimate", async () => {
        const vars = preflightVars({
            tierBalance: 1,
            packBalance: 2,
            pollenBalance: 2,
        });

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

    it("rejects regular preflight when both buckets are below the model estimate", async () => {
        const vars = preflightVars({
            tierBalance: 0.5,
            packBalance: 0.5,
            pollenBalance: 2,
        });

        await expect(checkBalance(vars, fakeStatsEnv(1))).rejects.toMatchObject(
            {
                status: 402,
            },
        );
    });

    it("uses positive balance as the fallback when model estimate is zero", async () => {
        const vars = preflightVars({
            tierBalance: 0,
            packBalance: 0.01,
            pollenBalance: 2,
        });

        await checkBalance(vars, fakeStatsEnv(0));

        expect(vars.balance.balanceCheckResult?.balances).toEqual({
            "v1:meter:tier": 0,
            "v1:meter:pack": 0.01,
        });
    });

    it("allows a zero-cost model when every balance is zero", async () => {
        const vars = preflightVars({
            tierBalance: 0,
            packBalance: 0,
            pollenBalance: 0,
        });

        await checkBalance(vars, fakeStatsEnv(0));

        expect(vars.balance.balanceCheckResult?.balances).toEqual({
            "v1:meter:tier": 0,
            "v1:meter:pack": 0,
        });
    });

    it("requires paid-only preflight to have pack balance above the model estimate", async () => {
        const vars = preflightVars({
            model: testModel("llama-maverick"),
            tierBalance: 10,
            packBalance: 1,
            pollenBalance: 2,
        });

        await expect(
            checkBalance(vars, fakeStatsEnv(1, "llama-maverick")),
        ).rejects.toMatchObject({
            status: 402,
        });
    });

    it("rejects finite API key budgets below the model estimate", async () => {
        const vars = preflightVars({
            tierBalance: 10,
            packBalance: 10,
            pollenBalance: 0.5,
        });

        await expect(checkBalance(vars, fakeStatsEnv(1))).rejects.toMatchObject(
            {
                status: 402,
            },
        );
    });

    it("uses the baseline estimate when BYOP markup does not apply", async () => {
        const vars = preflightVars({
            tierBalance: 10,
            packBalance: 10,
            pollenBalance: 1.1,
            apiKey: {
                byopClientKeyId: "pk-test",
                byopMarkupApplies: false,
            },
        });

        await checkBalance(vars, {
            ...fakeStatsEnv(1),
            DB: {
                prepare: () => {
                    throw new Error("DB should not be used in preflight");
                },
            } as unknown as D1Database,
        } as CloudflareBindings);
    });

    it("leaves BYOP markup enforcement to Enter authorization", async () => {
        const vars = preflightVars({
            tierBalance: 10,
            packBalance: 10,
            pollenBalance: 1.1,
            apiKey: {
                byopClientKeyId: "pk-test",
                byopMarkupApplies: true,
            },
        });

        await checkBalance(vars, fakeStatsEnv(1));
        expect(vars.balance.billingEstimatePrice).toBe(1);
    });

    it("admits a BYOP API key budget that covers baseline plus markup", async () => {
        const vars = preflightVars({
            tierBalance: 10,
            packBalance: 10,
            pollenBalance: 1.25,
            apiKey: {
                byopClientKeyId: "pk-test",
                byopMarkupApplies: true,
            },
        });

        await checkBalance(vars, {
            ...fakeStatsEnv(1),
            DB: {
                prepare: () => {
                    throw new Error("DB should not be used in preflight");
                },
            } as unknown as D1Database,
        } as CloudflareBindings);
    });

    it("admits a baseline user balance before Enter applies BYOP markup", async () => {
        const vars = preflightVars({
            tierBalance: 1.1,
            packBalance: 0,
            pollenBalance: 10,
            apiKey: {
                byopClientKeyId: "pk-test",
                byopMarkupApplies: true,
            },
        });

        await checkBalance(vars, fakeStatsEnv(1));
    });

    it("admits a BYOP user balance that covers baseline plus markup", async () => {
        const vars = preflightVars({
            tierBalance: 1.25,
            packBalance: 0,
            pollenBalance: 10,
            apiKey: {
                byopClientKeyId: "pk-test",
                byopMarkupApplies: true,
            },
        });

        await checkBalance(vars, {
            ...fakeStatsEnv(1),
            DB: {
                prepare: () => {
                    throw new Error("DB should not be used in preflight");
                },
            } as unknown as D1Database,
        } as CloudflareBindings);
    });

    it("discards a Tinybird average that is wildly above the defined per-request price", async () => {
        const definition = communityModelDefinition({
            modelId: "vendouple/zimage",
            description: null,
            modality: "image",
            imagePricing: "request",
            ...communityEndpointPrices({ completionImagePrice: 0.01 }),
        });
        expect(getDefinedRequestEstimate(definition)).toBe(0.01);
        expect(
            getEstimatedPrice(
                {
                    data: [
                        { model: "vendouple/zimage", avg_cost_usd: 33.3433 },
                    ],
                },
                "vendouple/zimage",
                definition,
            ),
        ).toBe(0.01);
        // Plausible Tinybird (within 10× of the defined rate) is trusted.
        expect(
            getEstimatedPrice(
                {
                    data: [{ model: "vendouple/zimage", avg_cost_usd: 0.012 }],
                },
                "vendouple/zimage",
                definition,
            ),
        ).toBe(0.012);

        const vars = preflightVars({
            tierBalance: 5,
            packBalance: 0,
            pollenBalance: 5,
            model: {
                requested: "vendouple/zimage",
                resolved: "vendouple/zimage",
                definition,
            },
        });

        await checkBalance(vars, fakeStatsEnv(33.3433, "vendouple/zimage"));
    });

    it("402s community flat-rate preflight against the defined price, not Tinybird", async () => {
        const definition = communityModelDefinition({
            modelId: "vendouple/zimage",
            description: null,
            modality: "image",
            imagePricing: "request",
            ...communityEndpointPrices({ completionImagePrice: 0.01 }),
        });
        const vars = preflightVars({
            tierBalance: 0.005,
            packBalance: 0,
            pollenBalance: 0.005,
            model: {
                requested: "vendouple/zimage",
                resolved: "vendouple/zimage",
                definition,
            },
        });

        await expect(
            checkBalance(vars, fakeStatsEnv(33.3433, "vendouple/zimage")),
        ).rejects.toMatchObject({
            status: 402,
            message: expect.stringContaining("~0.0100"),
        });
    });

    it("keeps Tinybird estimates for token-priced models", async () => {
        const definition = getRegistryModelDefinition("openai");
        expect(getDefinedRequestEstimate(definition)).toBeNull();
        expect(
            getEstimatedPrice(
                { data: [{ model: "openai", avg_cost_usd: 1.25 }] },
                "openai",
                definition,
            ),
        ).toBe(1.25);
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

    it("suppresses generation credits when the payer goes negative", async () => {
        const { payerId, devId, pkId } = await setupPayerAndDev();
        const ownerId = await createBalanceUser("community-owner");

        const { markup, communityModelReward, billedPrice } =
            await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 2,
                userId: payerId,
                byopClientKeyId: pkId,
                communityModelReward: {
                    userId: ownerId,
                    rewardRate: COMMUNITY_MODEL_REWARD_RATE,
                },
            });

        expect(billedPrice).toBe(
            roundPollenLedgerAmount(2 + computeDevCredit(2)),
        );
        expect(markup).toBeNull();
        expect(communityModelReward).toBeNull();
        expect((await getUserBalance(db, payerId)).tierBalance).toBeLessThan(0);
        expect((await getUserBalance(db, devId)).tierBalance).toBe(0);
        expect((await getUserBalance(db, ownerId)).tierBalance).toBe(0);
    });

    it("still credits a community owner when the payer reaches zero", async () => {
        const payerId = await createBalanceUser("payer", {
            tier: 1,
            pack: 0,
        });
        const ownerId = await createBalanceUser("community-owner");

        const { communityModelReward } = await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice: 1,
            userId: payerId,
            communityModelReward: {
                userId: ownerId,
                rewardRate: COMMUNITY_MODEL_REWARD_RATE,
            },
        });

        expect(communityModelReward).not.toBeNull();
        expect((await getUserBalance(db, payerId)).tierBalance).toBe(0);
        expect((await getUserBalance(db, ownerId)).tierBalance).toBeCloseTo(
            COMMUNITY_MODEL_REWARD_RATE,
            10,
        );
    });

    it("does not charge or reward a community model owner for their own request", async () => {
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
                    rewardRate: COMMUNITY_MODEL_REWARD_RATE,
                },
            });

        expect(billedPrice).toBe(0);
        expect(communityModelReward).toBeNull();
        expect((await getUserBalance(db, ownerId)).tierBalance).toBe(2);
    });
});

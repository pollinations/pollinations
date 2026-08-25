import { env } from "cloudflare:test";
import {
    byopClientAllowsMarkup,
    computeDevCredit,
    MARKUP_PCT,
    withByopMarkup,
} from "@shared/billing/markup.ts";
import { resolveDevMarkup } from "@shared/billing/track-helpers.ts";
import {
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

    it("rejects regular preflight when both buckets are below the model estimate", async () => {
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
                    tierBalance: 0.5,
                    packBalance: 0.5,
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

    it("allows a zero-cost model when every balance is zero", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: { id: "sk-test", pollenBalance: 0 },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 0,
                    packBalance: 0,
                }),
            },
            model: testModel(),
            log: fakeLog(),
        } as unknown as Parameters<typeof checkBalance>[0];

        await checkBalance(vars, fakeStatsEnv(0));

        expect(vars.balance.balanceCheckResult?.balances).toEqual({
            "v1:meter:tier": 0,
            "v1:meter:pack": 0,
        });
    });

    it("requires paid-only preflight to have pack balance covering the model estimate", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: { id: "sk-test", pollenBalance: 2 },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 10,
                    packBalance: 0.5,
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

    it("admits paid-only preflight with pack balance exactly at the model estimate", async () => {
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

        await checkBalance(vars, fakeStatsEnv(1, "llama-maverick"));

        expect(vars.balance.balanceCheckResult?.balances).toEqual({
            "v1:meter:tier": 0,
            "v1:meter:pack": 1,
        });
    });

    it("rejects paid-only preflight with no pack balance on a zero estimate", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: { id: "sk-test", pollenBalance: 2 },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 10,
                    packBalance: 0,
                }),
            },
            model: testModel("llama-maverick"),
            log: fakeLog(),
        } as unknown as Parameters<typeof checkBalance>[0];

        await expect(
            checkBalance(vars, fakeStatsEnv(0, "llama-maverick")),
        ).rejects.toMatchObject({
            status: 402,
        });
    });

    it("rejects finite API key budgets below the model estimate", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: { id: "sk-test", pollenBalance: 0.5 },
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

    it("uses the baseline estimate when BYOP markup does not apply", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: {
                    id: "sk-test",
                    byopClientKeyId: "pk-test",
                    byopMarkupApplies: false,
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

    it("rejects a BYOP API key budget that covers baseline but not markup", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: {
                    id: "sk-test",
                    byopClientKeyId: "pk-test",
                    byopMarkupApplies: true,
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

        await expect(
            checkBalance(vars, {
                ...fakeStatsEnv(1),
                DB: {
                    prepare: () => {
                        throw new Error("DB should not be used in preflight");
                    },
                } as unknown as D1Database,
            } as CloudflareBindings),
        ).rejects.toMatchObject({
            status: 402,
            message: expect.stringContaining("1.2500"),
        });
    });

    it("admits a BYOP API key budget that covers baseline plus markup", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: {
                    id: "sk-test",
                    byopClientKeyId: "pk-test",
                    byopMarkupApplies: true,
                    pollenBalance: 1.25,
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

    it("rejects a BYOP user balance that covers baseline but not markup", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: {
                    id: "sk-test",
                    byopClientKeyId: "pk-test",
                    byopMarkupApplies: true,
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

        await expect(
            checkBalance(vars, {
                ...fakeStatsEnv(1),
                DB: {
                    prepare: () => {
                        throw new Error("DB should not be used in preflight");
                    },
                } as unknown as D1Database,
            } as CloudflareBindings),
        ).rejects.toMatchObject({
            status: 402,
            message: expect.stringContaining("1.2500"),
        });
    });

    it("admits a BYOP user balance that covers baseline plus markup", async () => {
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: {
                    id: "sk-test",
                    byopClientKeyId: "pk-test",
                    byopMarkupApplies: true,
                    pollenBalance: 10,
                },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 1.25,
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

        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: { id: "sk-test", pollenBalance: 5 },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 5,
                    packBalance: 0,
                }),
            },
            model: {
                requested: "vendouple/zimage",
                resolved: "vendouple/zimage",
                definition,
            },
            log: fakeLog(),
        } as unknown as Parameters<typeof checkBalance>[0];

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
        const vars = {
            auth: {
                user: { id: "preflight-payer" },
                apiKey: { id: "sk-test", pollenBalance: 0.005 },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 0.005,
                    packBalance: 0,
                }),
            },
            model: {
                requested: "vendouple/zimage",
                resolved: "vendouple/zimage",
                definition,
            },
            log: fakeLog(),
        } as unknown as Parameters<typeof checkBalance>[0];

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
});

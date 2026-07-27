import { describe, expect, it, vi } from "vitest";
import {
    calculateUsageBilling,
    getModels,
    getRegistryModelDefinition,
    type ModelDefinition,
    type ModelName,
    totalPromptTokens,
} from "../../shared/registry/registry.ts";

function bill(
    model: ModelName,
    usage: Parameters<typeof calculateUsageBilling>[1],
    input?: Parameters<typeof calculateUsageBilling>[4],
) {
    return calculateUsageBilling(
        model,
        usage,
        getRegistryModelDefinition(model),
        undefined,
        input,
    );
}

describe("long-context cost variants", () => {
    it.each([
        ["gpt-5.4", 272_000],
        ["openai-large", 272_000],
        ["midijourney-large", 272_000],
        ["gpt-5.6-sol", 272_000],
        ["gpt-5.6-terra", 272_000],
        ["gpt-5.6-luna", 272_000],
    ] satisfies [
        ModelName,
        number,
    ][])("%s uses a strict greater-than boundary", (model, threshold) => {
        expect(
            bill(model, { promptTextTokens: threshold - 1 }).costVariant,
        ).toBeUndefined();
        expect(
            bill(model, { promptTextTokens: threshold }).costVariant,
        ).toBeUndefined();
        expect(
            bill(model, { promptTextTokens: threshold + 1 }).costVariant,
        ).toBe("long_context");
    });

    it.each([
        ["gemini-large", 200_000],
        ["qwen-large", 256_000],
        ["grok-4.5", 200_000],
    ] satisfies [
        ModelName,
        number,
    ][])("%s uses OpenRouter's inclusive min_prompt_tokens boundary", (model, threshold) => {
        expect(
            bill(model, { promptTextTokens: threshold - 1 }).costVariant,
        ).toBeUndefined();
        expect(bill(model, { promptTextTokens: threshold }).costVariant).toBe(
            "long_context",
        );
        expect(
            bill(model, { promptTextTokens: threshold + 1 }).costVariant,
        ).toBe("long_context");
    });

    it("reprices the whole GPT-5.5 request one token above 272K", () => {
        const billing = bill("openai-large", {
            promptTextTokens: 272_001,
            promptCachedTokens: 10_000,
            completionTextTokens: 1_000,
        });

        expect(billing.costVariant).toBe("long_context");
        expect(billing.cost.totalCost).toBeCloseTo(
            272_001 * (10 / 1e6) + 10_000 * (1 / 1e6) + 1_000 * (45 / 1e6),
            12,
        );
        expect(billing.priceDefinition).toMatchObject({
            promptTextTokens: 10 / 1e6,
            promptCachedTokens: 1 / 1e6,
            completionTextTokens: 45 / 1e6,
        });
    });

    it.each([
        ["gpt-5.6-sol", 10, 1, 12.5, 45],
        ["gpt-5.6-terra", 5, 0.5, 6.25, 22.5],
        ["gpt-5.6-luna", 2, 0.2, 2.5, 9],
    ] satisfies [
        ModelName,
        number,
        number,
        number,
        number,
    ][])("%s applies its long-context sheet before the existing 0.5 multiplier", (model, textRate, cachedRate, cacheWriteRate, outputRate) => {
        const usage = {
            promptTextTokens: 272_001,
            promptCachedTokens: 10,
            promptCacheWriteTokens: 20,
            completionTextTokens: 30,
        };
        const billing = bill(model, usage);

        expect(billing.costVariant).toBe("long_context");
        expect(billing.cost.totalCost).toBeCloseTo(
            usage.promptTextTokens * (textRate / 1e6) +
                usage.promptCachedTokens * (cachedRate / 1e6) +
                usage.promptCacheWriteTokens * (cacheWriteRate / 1e6) +
                usage.completionTextTokens * (outputRate / 1e6),
            12,
        );
        expect(billing.priceDefinition).toMatchObject({
            promptTextTokens: (textRate * 0.5) / 1e6,
            promptCachedTokens: (cachedRate * 0.5) / 1e6,
            promptCacheWriteTokens: (cacheWriteRate * 0.5) / 1e6,
            completionTextTokens: (outputRate * 0.5) / 1e6,
        });
        expect(billing.price.totalPrice).toBeCloseTo(
            billing.cost.totalCost * 0.5,
            12,
        );
    });

    it("counts every prompt token modality, but not audio seconds", () => {
        expect(
            totalPromptTokens({
                promptTextTokens: 100_000,
                promptCachedTokens: 50_000,
                promptCacheWriteTokens: 20_000,
                promptAudioTokens: 10_000,
                promptImageTokens: 10_000,
                promptVideoTokens: 10_000,
                promptAudioSeconds: 999_999,
            }),
        ).toBe(200_000);
    });

    it("Gemini inherits rates absent from the long-context override", () => {
        const usage = {
            promptTextTokens: 100_000,
            promptCachedTokens: 50_000,
            promptCacheWriteTokens: 20_000,
            promptAudioTokens: 10_000,
            promptImageTokens: 10_000,
            promptVideoTokens: 10_000,
            completionTextTokens: 1_000,
        };
        const billing = bill("gemini-large", usage);

        expect(billing.costVariant).toBe("long_context");
        expect(billing.priceDefinition).toMatchObject({
            promptTextTokens: 4 / 1e6,
            promptCachedTokens: 0.4 / 1e6,
            promptCacheWriteTokens: 0.375 / 1e6,
            promptAudioTokens: 4 / 1e6,
            promptImageTokens: 2 / 1e6,
            promptVideoTokens: 2 / 1e6,
            completionTextTokens: 18 / 1e6,
        });
    });

    it("Qwen and Grok apply their advertised long-context sheets", () => {
        expect(
            bill("qwen-large", {
                promptTextTokens: 256_000,
            }).priceDefinition,
        ).toMatchObject({
            promptTextTokens: 0.96 / 1e6,
            promptCachedTokens: 0.192 / 1e6,
            promptCacheWriteTokens: 1.2 / 1e6,
            completionTextTokens: 3.84 / 1e6,
        });
        expect(
            bill("grok-4.5", {
                promptTextTokens: 200_000,
            }).priceDefinition,
        ).toMatchObject({
            promptTextTokens: 4 / 1e6,
            promptCachedTokens: 0.6 / 1e6,
            completionTextTokens: 12 / 1e6,
        });
    });

    it("bills reasoning tokens at the selected completion rate", () => {
        const billing = bill("gpt-5.4", {
            promptTextTokens: 300_000,
            completionReasoningTokens: 2_000,
        });

        expect(billing.cost.completionReasoningTokens).toBeCloseTo(
            2_000 * (22.5 / 1e6),
            12,
        );
    });
});

describe("request-mode cost variants", () => {
    it("qwen-image bills text-to-image and edit at their separate rates", () => {
        const textToImage = bill("qwen-image", {
            completionImageTokens: 1,
        });
        const edit = bill(
            "qwen-image",
            { completionImageTokens: 1 },
            { hasImage: true },
        );

        expect(textToImage.costVariant).toBeUndefined();
        expect(textToImage.cost.totalCost).toBeCloseTo(0.025, 12);
        expect(edit.costVariant).toBe("edit");
        expect(edit.cost.totalCost).toBeCloseTo(0.03, 12);
    });

    it("wan-pro-1080p bills text-to-video and image-to-video separately", () => {
        const textToVideo = bill("wan-pro-1080p", {
            completionVideoSeconds: 5,
        });
        const imageToVideo = bill(
            "wan-pro-1080p",
            { completionVideoSeconds: 5 },
            { hasImage: true },
        );

        expect(textToVideo.costVariant).toBeUndefined();
        expect(textToVideo.cost.totalCost).toBeCloseTo(5 * 0.1, 12);
        expect(imageToVideo.costVariant).toBe("image_to_video");
        expect(imageToVideo.cost.totalCost).toBeCloseTo(5 * 0.15, 12);
    });
});

describe("selection safety and composition", () => {
    const fakeModel = (
        overrides: Partial<ModelDefinition>,
    ): ModelDefinition => ({
        aliases: [],
        provider: "test",
        brand: "Test",
        category: "text",
        cost: { promptTextTokens: 1e-6, completionTextTokens: 2e-6 },
        priceMultiplier: 1,
        addedDate: 0,
        title: "Test",
        ...overrides,
    });

    it("unknown variant name warns and bills base rates", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const billing = calculateUsageBilling(
            "test-model",
            { promptTextTokens: 1_000 },
            fakeModel({
                costVariants: { real: { promptTextTokens: 9e-6 } },
                selectCostVariant: () => "typo",
            }),
        );

        expect(billing.costVariant).toBeUndefined();
        expect(billing.cost.totalCost).toBeCloseTo(1_000 * 1e-6, 12);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('Unknown cost variant "typo"'),
        );
    });

    it("throwing selector warns and bills base rates", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const billing = calculateUsageBilling(
            "test-model",
            { promptTextTokens: 1_000 },
            fakeModel({
                costVariants: { real: { promptTextTokens: 9e-6 } },
                selectCostVariant: () => {
                    throw new Error("boom");
                },
            }),
        );

        expect(billing.costVariant).toBeUndefined();
        expect(billing.cost.totalCost).toBeCloseTo(1_000 * 1e-6, 12);
        expect(warn).toHaveBeenCalled();
    });

    it("preserves an explicit zero-rate override", () => {
        const billing = calculateUsageBilling(
            "test-model",
            { promptTextTokens: 1_000 },
            fakeModel({
                costVariants: { free_input: { promptTextTokens: 0 } },
                selectCostVariant: () => "free_input",
            }),
        );

        expect(billing.costVariant).toBe("free_input");
        expect(billing.cost.totalCost).toBe(0);
        expect(billing.priceDefinition.promptTextTokens).toBe(0);
    });

    it("applies variants before multipliers and keeps adjustments independent", () => {
        const billing = calculateUsageBilling(
            "test-model",
            { promptTextTokens: 1_000 },
            fakeModel({
                priceMultiplier: 0.75,
                costVariants: { premium: { promptTextTokens: 3e-6 } },
                selectCostVariant: () => "premium",
                billing: {
                    adjustments: [
                        {
                            id: "test.adjustment.v1",
                            description: "test",
                            kind: "test",
                            unit: "request",
                            unitCost: 0.1,
                            countUnits: () => 1,
                        },
                    ],
                },
            }),
        );

        expect(billing.cost.totalCost).toBeCloseTo(0.103, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.07725, 12);
        expect(billing.priceDefinition.promptTextTokens).toBeCloseTo(
            2.25e-6,
            15,
        );
        expect(billing.adjustments).toHaveLength(1);
        expect(billing.adjustments[0]).toMatchObject({
            ruleId: "test.adjustment.v1",
            cost: 0.1,
        });
        expect(billing.adjustments[0].price).toBeCloseTo(0.075, 12);
    });
});

describe("registry-wide variant invariants", () => {
    it("variant sheets only contain valid finite rates from the base sheet", () => {
        for (const model of getModels()) {
            const def = getRegistryModelDefinition(model);
            for (const [name, sheet] of Object.entries(
                def.costVariants ?? {},
            )) {
                for (const [key, rate] of Object.entries(sheet)) {
                    expect(
                        Object.keys(def.cost),
                        `${model} variant "${name}" key "${key}"`,
                    ).toContain(key);
                    expect(key).not.toBe("completionReasoningTokens");
                    expect(
                        Number.isFinite(rate) && rate >= 0,
                        `${model} variant "${name}" rate "${key}"`,
                    ).toBe(true);
                }
            }
        }
    });

    it("models with costVariants have a selector, and vice versa", () => {
        for (const model of getModels()) {
            const def = getRegistryModelDefinition(model);
            expect(
                Boolean(def.costVariants),
                `${model}: costVariants and selectCostVariant must pair`,
            ).toBe(Boolean(def.selectCostVariant));
        }
    });
});

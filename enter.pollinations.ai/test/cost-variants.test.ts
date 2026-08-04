import { describe, expect, it, vi } from "vitest";
import { modelInfoFromDefinition } from "../../shared/registry/model-info.ts";
import {
    calculateCost,
    calculatePrice,
    calculateUsageBilling,
    getModels,
    getRegistryModelDefinition,
    type ModelDefinition,
    type ModelName,
    totalPromptTokens,
} from "../../shared/registry/registry.ts";

type BillingArgs = Parameters<typeof calculateUsageBilling>[0];

function bill(
    model: ModelName,
    usage: BillingArgs["usage"],
    input?: BillingArgs["input"],
) {
    return calculateUsageBilling({
        model,
        usage,
        servedBy: getRegistryModelDefinition(model),
        input,
    });
}

describe("long-context cost variants", () => {
    it.each([
        ["openai/gpt-5.4", 272_000],
        ["openai/gpt-5.5", 272_000],
        ["midijourney-large", 272_000],
        ["openai/gpt-5.6-sol", 272_000],
        ["openai/gpt-5.6-terra", 272_000],
        ["openai/gpt-5.6-luna", 272_000],
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

    it("Gemini uses OpenRouter's inclusive 200K boundary", () => {
        expect(
            bill("google/gemini-3.1-pro-preview", {
                promptTextTokens: 199_999,
            }).costVariant,
        ).toBeUndefined();
        expect(
            bill("google/gemini-3.1-pro-preview", {
                promptTextTokens: 200_000,
            }).costVariant,
        ).toBe("long_context");
        expect(
            bill("google/gemini-3.1-pro-preview", {
                promptTextTokens: 200_001,
            }).costVariant,
        ).toBe("long_context");
    });

    it("Qwen uses OpenRouter's inclusive 256K boundary", () => {
        expect(
            bill("qwen/qwen3.7-plus", {
                promptTextTokens: 255_999,
            }).costVariant,
        ).toBeUndefined();
        expect(
            bill("qwen/qwen3.7-plus", {
                promptTextTokens: 256_000,
            }).costVariant,
        ).toBe("long_context");
        expect(
            bill("qwen/qwen3.7-plus", {
                promptTextTokens: 256_001,
            }).costVariant,
        ).toBe("long_context");
    });

    it("Grok uses OpenRouter's inclusive 200K boundary", () => {
        expect(
            bill("x-ai/grok-4.5", {
                promptTextTokens: 199_999,
            }).costVariant,
        ).toBeUndefined();
        expect(
            bill("x-ai/grok-4.5", {
                promptTextTokens: 200_000,
            }).costVariant,
        ).toBe("long_context");
        expect(
            bill("x-ai/grok-4.5", {
                promptTextTokens: 200_001,
            }).costVariant,
        ).toBe("long_context");
    });

    it.each([
        [31_999, undefined],
        [32_000, "context_32k"],
        [32_001, "context_32k"],
        [255_999, "context_32k"],
        [256_000, "context_256k"],
        [256_001, "context_256k"],
    ] as const)("Qwen3.7 Flash selects the expected sheet at %s prompt tokens", (promptTextTokens, expectedVariant) => {
        expect(
            bill("qwen/qwen3.7-flash", { promptTextTokens }).costVariant,
        ).toBe(expectedVariant);
    });

    it("Qwen3.7 Flash counts cached and media tokens toward its tiers", () => {
        expect(
            bill("qwen/qwen3.7-flash", {
                promptTextTokens: 20_000,
                promptCachedTokens: 5_000,
                promptCacheWriteTokens: 2_000,
                promptImageTokens: 2_000,
                promptVideoTokens: 3_000,
            }).costVariant,
        ).toBe("context_32k");
        expect(
            bill("qwen/qwen3.7-flash", {
                promptTextTokens: 200_000,
                promptCachedTokens: 20_000,
                promptCacheWriteTokens: 10_000,
                promptImageTokens: 10_000,
                promptVideoTokens: 16_000,
            }).costVariant,
        ).toBe("context_256k");
    });

    it("Qwen3.7 Flash applies every advertised token rate per tier", () => {
        const expectedRates = [
            [
                31_999,
                undefined,
                {
                    promptTextTokens: 0.03,
                    promptCachedTokens: 0.006,
                    promptCacheWriteTokens: 0.038,
                    promptImageTokens: 0.03,
                    promptVideoTokens: 0.03,
                    completionTextTokens: 0.13,
                },
            ],
            [
                32_000,
                "context_32k",
                {
                    promptTextTokens: 0.1,
                    promptCachedTokens: 0.02,
                    promptCacheWriteTokens: 0.125,
                    promptImageTokens: 0.1,
                    promptVideoTokens: 0.1,
                    completionTextTokens: 0.4,
                },
            ],
            [
                256_000,
                "context_256k",
                {
                    promptTextTokens: 0.2,
                    promptCachedTokens: 0.04,
                    promptCacheWriteTokens: 0.25,
                    promptImageTokens: 0.2,
                    promptVideoTokens: 0.2,
                    completionTextTokens: 0.8,
                },
            ],
        ] as const;

        for (const [promptTextTokens, variant, rates] of expectedRates) {
            const billing = bill("qwen/qwen3.7-flash", { promptTextTokens });
            expect(billing.costVariant).toBe(variant);
            for (const [usageType, perMillionTokens] of Object.entries(rates)) {
                expect(
                    billing.priceDefinition[
                        usageType as keyof typeof billing.priceDefinition
                    ],
                ).toBeCloseTo(perMillionTokens / 1e6, 15);
            }
        }
    });

    it("reprices the whole GPT-5.5 request one token above 272K", () => {
        const billing = bill("openai/gpt-5.5", {
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
        ["openai/gpt-5.6-sol", 10, 1, 12.5, 45],
        ["openai/gpt-5.6-terra", 5, 0.5, 6.25, 22.5],
        ["openai/gpt-5.6-luna", 2, 0.2, 2.5, 9],
    ] satisfies [
        ModelName,
        number,
        number,
        number,
        number,
    ][])("%s applies every Azure long-context meter to the full request", (model, input, cached, cacheWrite, output) => {
        const billing = bill(model, {
            promptTextTokens: 272_001,
            promptCachedTokens: 1_000,
            promptCacheWriteTokens: 1_000,
            completionTextTokens: 1_000,
        });

        expect(billing.costVariant).toBe("long_context");
        expect(billing.priceDefinition).toMatchObject({
            promptTextTokens: (input * 0.5) / 1e6,
            promptCachedTokens: (cached * 0.5) / 1e6,
            promptCacheWriteTokens: (cacheWrite * 0.5) / 1e6,
            completionTextTokens: (output * 0.5) / 1e6,
        });
        expect(billing.cost.totalCost).toBeCloseTo(
            272_001 * (input / 1e6) +
                1_000 * (cached / 1e6) +
                1_000 * (cacheWrite / 1e6) +
                1_000 * (output / 1e6),
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

    it("Gemini applies its complete long-context sheet", () => {
        const usage = {
            promptTextTokens: 100_001,
            promptCachedTokens: 50_000,
            promptCacheWriteTokens: 20_000,
            promptAudioTokens: 10_000,
            promptImageTokens: 10_000,
            promptVideoTokens: 10_000,
            completionTextTokens: 1_000,
        };
        const billing = bill("google/gemini-3.1-pro-preview", usage);

        expect(billing.costVariant).toBe("long_context");
        expect(billing.priceDefinition).toMatchObject({
            promptTextTokens: 4 / 1e6,
            promptCachedTokens: 0.4 / 1e6,
            promptCacheWriteTokens: 4 / 1e6,
            promptAudioTokens: 4 / 1e6,
            promptImageTokens: 2 / 1e6,
            promptVideoTokens: 4 / 1e6,
            completionTextTokens: 18 / 1e6,
        });
    });

    it("Gemini cache writes include input and storage exactly once", () => {
        const baseOutput = {
            usage: {
                prompt_tokens_details: { cache_write_tokens: 100_000 },
            },
        };
        const base = calculateUsageBilling({
            model: "google/gemini-3.1-pro-preview",
            usage: { promptCacheWriteTokens: 100_000 },
            servedBy: getRegistryModelDefinition(
                "google/gemini-3.1-pro-preview",
            ),
            output: baseOutput,
        });
        expect(base.costVariant).toBeUndefined();
        expect(base.cost.totalCost).toBeCloseTo(0.2375, 12);
        expect(base.adjustments).toHaveLength(1);
        expect(base.adjustments[0].cost).toBeCloseTo(0.0375, 12);

        const long = calculateUsageBilling({
            model: "google/gemini-3.1-pro-preview",
            usage: { promptCacheWriteTokens: 1_000_000 },
            servedBy: getRegistryModelDefinition(
                "google/gemini-3.1-pro-preview",
            ),
            output: {
                usage: {
                    prompt_tokens_details: {
                        cache_write_tokens: 1_000_000,
                    },
                },
            },
        });
        expect(long.costVariant).toBe("long_context");
        expect(long.cost.totalCost).toBeCloseTo(4.375, 12);
        expect(long.adjustments).toHaveLength(1);
        expect(long.adjustments[0].cost).toBeCloseTo(0.375, 12);
    });

    it("Qwen and Grok apply their advertised long-context sheets", () => {
        expect(
            bill("qwen/qwen3.7-plus", {
                promptTextTokens: 256_000,
            }).priceDefinition,
        ).toMatchObject({
            promptTextTokens: 0.96 / 1e6,
            promptCachedTokens: 0.192 / 1e6,
            promptCacheWriteTokens: 1.2 / 1e6,
            completionTextTokens: 3.84 / 1e6,
        });
        expect(
            bill("x-ai/grok-4.5", {
                promptTextTokens: 200_000,
            }).priceDefinition,
        ).toMatchObject({
            promptTextTokens: 4 / 1e6,
            promptCachedTokens: 0.6 / 1e6,
            completionTextTokens: 12 / 1e6,
        });
    });

    it("bills reasoning tokens at the selected completion rate", () => {
        const billing = bill("openai/gpt-5.4", {
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
        const textToImage = bill("qwen/qwen-image", {
            completionImageTokens: 1,
        });
        const edit = bill(
            "qwen/qwen-image",
            { completionImageTokens: 1 },
            { hasImage: true },
        );

        expect(textToImage.costVariant).toBeUndefined();
        expect(textToImage.costVariantStatus).toBe("base");
        expect(textToImage.cost.totalCost).toBeCloseTo(0.025, 12);
        expect(edit.costVariant).toBe("edit");
        expect(edit.costVariantStatus).toBe("selected");
        expect(edit.cost.totalCost).toBeCloseTo(0.03, 12);
    });

    it("public calculation helpers forward request pricing input", () => {
        const usage = { completionImageTokens: 1 };

        expect(
            calculateCost("qwen/qwen-image", usage, undefined, {
                hasImage: true,
            }).totalCost,
        ).toBeCloseTo(0.03, 12);
        expect(
            calculatePrice("qwen/qwen-image", usage, undefined, {
                hasImage: true,
            }).totalPrice,
        ).toBeCloseTo(0.03, 12);
    });
});

describe("resolution cost variants", () => {
    it("p-video bills the 720p base and 1080p variant", () => {
        expect(
            bill("prunaai/p-video", { completionVideoSeconds: 10 }).cost
                .totalCost,
        ).toBeCloseTo(0.2, 12);

        const fullHd = bill(
            "prunaai/p-video",
            { completionVideoSeconds: 10 },
            { resolution: "1080p" },
        );
        expect(fullHd.costVariant).toBe("1080p");
        expect(fullHd.cost.totalCost).toBeCloseTo(0.4, 12);
    });

    it("veo reprices 1080p video while inheriting its audio rate", () => {
        const billing = bill(
            "google/veo-3.1-fast",
            { completionVideoSeconds: 8, completionAudioSeconds: 8 },
            { resolution: "1080p" },
        );

        expect(billing.costVariant).toBe("1080p");
        expect(billing.cost.completionVideoSeconds).toBeCloseTo(0.8, 12);
        expect(billing.cost.completionAudioSeconds).toBeCloseTo(0.16, 12);
    });

    it("wan-pro distinguishes 1080p text-to-video and image-to-video", () => {
        const text = bill(
            "alibaba/wan-2.7",
            { completionVideoSeconds: 5 },
            { resolution: "1080p" },
        );
        const image = bill(
            "alibaba/wan-2.7",
            { completionVideoSeconds: 5 },
            { resolution: "1080p", hasImage: true },
        );

        expect(text.costVariant).toBe("1080p");
        expect(text.cost.totalCost).toBeCloseTo(0.5, 12);
        expect(image.costVariant).toBe("1080p_image");
        expect(image.cost.totalCost).toBeCloseTo(0.75, 12);
    });

    it("seedance-pro bills 480p and 1080p around its 720p base", () => {
        const tiers = [
            [undefined, 0.025],
            ["480p", 0.015],
            ["1080p", 0.06],
        ] as const;

        for (const [resolution, rate] of tiers) {
            const billing = bill(
                "bytedance/seedance-1-pro-fast",
                { completionVideoSeconds: 6 },
                resolution ? { resolution } : undefined,
            );
            expect(billing.cost.totalCost).toBeCloseTo(6 * rate, 12);
        }
    });

    it("publishes supported resolutions with effective variant pricing", () => {
        const definition = getRegistryModelDefinition("prunaai/p-video");
        const info = modelInfoFromDefinition("prunaai/p-video", definition);

        expect(info.resolutions).toEqual(["720p", "1080p"]);
        expect(
            info.pricing_variants?.find(({ name }) => name === "1080p")
                ?.pricing,
        ).toMatchObject({
            completionVideoSeconds: "0.04",
            currency: "pollen",
        });
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
        const billing = calculateUsageBilling({
            model: "test-model",
            usage: { promptTextTokens: 1_000 },
            servedBy: fakeModel({
                costVariants: { real: { promptTextTokens: 9e-6 } },
                selectCostVariant: () => "typo",
            }),
        });

        expect(billing.costVariant).toBeUndefined();
        expect(billing.costVariantStatus).toBe("unknown");
        expect(billing.cost.totalCost).toBeCloseTo(1_000 * 1e-6, 12);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('Unknown cost variant "typo"'),
        );
    });

    it("throwing selector warns and bills base rates", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const billing = calculateUsageBilling({
            model: "test-model",
            usage: { promptTextTokens: 1_000 },
            servedBy: fakeModel({
                costVariants: { real: { promptTextTokens: 9e-6 } },
                selectCostVariant: () => {
                    throw new Error("boom");
                },
            }),
        });

        expect(billing.costVariant).toBeUndefined();
        expect(billing.costVariantStatus).toBe("selector_error");
        expect(billing.cost.totalCost).toBeCloseTo(1_000 * 1e-6, 12);
        expect(warn).toHaveBeenCalled();
    });

    it("preserves an explicit zero-rate override", () => {
        const billing = calculateUsageBilling({
            model: "test-model",
            usage: { promptTextTokens: 1_000 },
            servedBy: fakeModel({
                costVariants: { free_input: { promptTextTokens: 0 } },
                selectCostVariant: () => "free_input",
            }),
        });

        expect(billing.costVariant).toBe("free_input");
        expect(billing.costVariantStatus).toBe("selected");
        expect(billing.cost.totalCost).toBe(0);
        expect(billing.priceDefinition.promptTextTokens).toBe(0);
    });

    it("applies variants before multipliers and keeps adjustments independent", () => {
        const billing = calculateUsageBilling({
            model: "test-model",
            usage: { promptTextTokens: 1_000 },
            servedBy: fakeModel({
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
        });

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

    it("keeps fallback cost on the served model and price on the quoted model", () => {
        const billing = calculateUsageBilling({
            model: "quoted-model",
            usage: { promptTextTokens: 1_000 },
            servedBy: fakeModel({
                cost: { promptTextTokens: 2e-6 },
                priceMultiplier: 3,
            }),
            quotedBy: fakeModel({
                cost: { promptTextTokens: 5e-6 },
                priceMultiplier: 2,
            }),
        });

        expect(billing.cost.totalCost).toBeCloseTo(0.002, 12);
        expect(billing.servedPrice).toBeCloseTo(0.006, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.01, 12);
        expect(billing.priceDefinition.promptTextTokens).toBeCloseTo(1e-5, 15);
    });

    it("reports a served-side selector failure while preserving the quoted price variant", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const billing = calculateUsageBilling({
            model: "quoted-model",
            usage: { promptTextTokens: 1_000 },
            servedBy: fakeModel({
                costVariants: { served_premium: { promptTextTokens: 9e-6 } },
                selectCostVariant: () => {
                    throw new Error("boom");
                },
            }),
            quotedBy: fakeModel({
                costVariants: { quoted_premium: { promptTextTokens: 7e-6 } },
                selectCostVariant: () => "quoted_premium",
            }),
        });

        expect(billing.cost.totalCost).toBeCloseTo(0.001, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.007, 12);
        expect(billing.priceDefinition.promptTextTokens).toBeCloseTo(7e-6, 15);
        expect(billing.costVariant).toBe("quoted_premium");
        expect(billing.costVariantStatus).toBe("selector_error");
        expect(warn).toHaveBeenCalledOnce();
    });

    it("continues reporting a quoted-side selector failure across a fallback", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const billing = calculateUsageBilling({
            model: "quoted-model",
            usage: { promptTextTokens: 1_000 },
            servedBy: fakeModel({}),
            quotedBy: fakeModel({
                cost: { promptTextTokens: 5e-6 },
                costVariants: { quoted_premium: { promptTextTokens: 9e-6 } },
                selectCostVariant: () => {
                    throw new Error("boom");
                },
            }),
        });

        expect(billing.cost.totalCost).toBeCloseTo(0.001, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.005, 12);
        expect(billing.priceDefinition.promptTextTokens).toBeCloseTo(5e-6, 15);
        expect(billing.costVariant).toBeUndefined();
        expect(billing.costVariantStatus).toBe("selector_error");
        expect(warn).toHaveBeenCalledOnce();
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

    it("every advertised non-default resolution selects a variant", () => {
        for (const model of getModels()) {
            const definition = getRegistryModelDefinition(model);
            for (const resolution of definition.resolutions?.slice(1) ?? []) {
                const variant = definition.selectCostVariant?.({
                    usage: {},
                    input: { resolution },
                });
                expect(
                    variant && definition.costVariants?.[variant],
                    `${model} must select a cost variant for ${resolution}`,
                ).toBeTruthy();
            }
        }
    });

    it("every variant has public metadata and effective /models pricing", () => {
        for (const model of getModels()) {
            const def = getRegistryModelDefinition(model);
            const variantNames = Object.keys(def.costVariants ?? {}).sort();
            const metadataNames = Object.keys(
                def.costVariantMetadata ?? {},
            ).sort();

            expect(
                metadataNames,
                `${model}: public variant metadata must match rate sheets`,
            ).toEqual(variantNames);

            if (variantNames.length === 0) continue;

            const info = modelInfoFromDefinition(model, def);
            expect(
                info.pricing_variants?.map((variant) => variant.name).sort(),
            ).toEqual(variantNames);
            for (const variant of info.pricing_variants ?? []) {
                expect(variant.label.trim()).not.toBe("");
                expect(variant.description.trim()).not.toBe("");
                expect(variant.pricing.currency).toBe("pollen");
            }
        }
    });
});

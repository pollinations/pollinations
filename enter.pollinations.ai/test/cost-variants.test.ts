import { describe, expect, it, vi } from "vitest";
import {
    calculateUsageBilling,
    getModels,
    getRegistryModelDefinition,
    type ModelDefinition,
    totalPromptTokens,
} from "../../shared/registry/registry.ts";

const gpt54 = getRegistryModelDefinition("gpt-5.4");
const geminiLarge = getRegistryModelDefinition("gemini-large");
const pVideo = getRegistryModelDefinition("p-video");
const veo = getRegistryModelDefinition("veo");
const wanPro = getRegistryModelDefinition("wan-pro");

describe("long-context cost variants", () => {
    it("bills base rates at exactly the threshold (strict >)", () => {
        const billing = calculateUsageBilling(
            "gpt-5.4",
            { promptTextTokens: 272_000, completionTextTokens: 1_000 },
            gpt54,
        );
        expect(billing.costVariant).toBeUndefined();
        expect(billing.cost.totalCost).toBeCloseTo(
            272_000 * (2.5 / 1e6) + 1_000 * (15 / 1e6),
            12,
        );
    });

    it("bills the whole request at long-context rates one token above", () => {
        const billing = calculateUsageBilling(
            "gpt-5.4",
            { promptTextTokens: 272_001, completionTextTokens: 1_000 },
            gpt54,
        );
        expect(billing.costVariant).toBe("long_context");
        expect(billing.cost.totalCost).toBeCloseTo(
            272_001 * (5 / 1e6) + 1_000 * (22.5 / 1e6),
            12,
        );
        // The effective per-unit price sheet reflects the variant, so
        // telemetry rows reproduce the billed totals.
        expect(billing.priceDefinition.promptTextTokens).toBeCloseTo(
            5 / 1e6,
            15,
        );
    });

    it("counts cached prompt tokens toward the threshold", () => {
        const atThreshold = calculateUsageBilling(
            "gemini-large",
            { promptTextTokens: 150_000, promptCachedTokens: 50_000 },
            geminiLarge,
        );
        expect(atThreshold.costVariant).toBeUndefined();

        const overThreshold = calculateUsageBilling(
            "gemini-large",
            { promptTextTokens: 150_001, promptCachedTokens: 50_000 },
            geminiLarge,
        );
        expect(overThreshold.costVariant).toBe("long_context");
        expect(overThreshold.cost.promptCachedTokens).toBeCloseTo(
            50_000 * (0.4 / 1e6),
            12,
        );
    });

    it("bills reasoning tokens at the variant's completion rate", () => {
        const billing = calculateUsageBilling(
            "gpt-5.4",
            { promptTextTokens: 300_000, completionReasoningTokens: 2_000 },
            gpt54,
        );
        // completionReasoningTokens falls back to the completionTextTokens
        // rate, which the long_context sheet overrides.
        expect(billing.cost.completionReasoningTokens).toBeCloseTo(
            2_000 * (22.5 / 1e6),
            12,
        );
    });

    it("excludes promptAudioSeconds from the token sum", () => {
        expect(
            totalPromptTokens({
                promptTextTokens: 10,
                promptAudioSeconds: 999_999,
            }),
        ).toBe(10);
    });
});

describe("resolution cost variants", () => {
    it("p-video bills 720p base without pricing input", () => {
        const billing = calculateUsageBilling(
            "p-video",
            { completionVideoSeconds: 10 },
            pVideo,
        );
        expect(billing.costVariant).toBeUndefined();
        expect(billing.cost.totalCost).toBeCloseTo(10 * 0.02, 12);
    });

    it("p-video bills the 1080p variant from pricing input", () => {
        const billing = calculateUsageBilling(
            "p-video",
            { completionVideoSeconds: 10 },
            pVideo,
            undefined,
            { resolution: "1080p" },
        );
        expect(billing.costVariant).toBe("1080p");
        expect(billing.cost.totalCost).toBeCloseTo(10 * 0.04, 12);
    });

    it("veo 1080p variant reprices video but keeps the audio rate", () => {
        const billing = calculateUsageBilling(
            "veo",
            { completionVideoSeconds: 8, completionAudioSeconds: 8 },
            veo,
            undefined,
            { resolution: "1080p" },
        );
        expect(billing.costVariant).toBe("1080p");
        expect(billing.cost.completionVideoSeconds).toBeCloseTo(8 * 0.1, 12);
        // Audio rate inherits from base — identical at both resolutions.
        expect(billing.cost.completionAudioSeconds).toBeCloseTo(8 * 0.02, 12);
    });

    it("wan-pro 1080p bills the single higher rate, matching the former wan-pro-1080p", () => {
        const billing = calculateUsageBilling(
            "wan-pro",
            { completionVideoSeconds: 5 },
            wanPro,
            undefined,
            { resolution: "1080p" },
        );
        expect(billing.cost.totalCost).toBeCloseTo(5 * 0.15, 12);
    });
});

describe("selection safety", () => {
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
        warn.mockRestore();
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
        warn.mockRestore();
    });
});

describe("registry-wide variant invariants", () => {
    it("variant sheets only override keys that exist in the base cost", () => {
        for (const model of getModels()) {
            const def = getRegistryModelDefinition(model);
            for (const [name, sheet] of Object.entries(
                def.costVariants ?? {},
            )) {
                for (const key of Object.keys(sheet)) {
                    // A variant key missing from base would mean the base
                    // request bills 0 for that line — a registry typo.
                    expect(
                        Object.keys(def.cost),
                        `${model} variant "${name}" key "${key}"`,
                    ).toContain(key);
                    // convertUsage remaps reasoning to the text rate before
                    // rate lookup, so this key would be silently dead.
                    expect(key).not.toBe("completionReasoningTokens");
                }
            }
        }
    });

    it("every non-default resolution selects a defined cost variant", () => {
        // Failure-direction guard: base is the cheapest sheet, so a
        // resolution that fails to select its variant would silently
        // under-bill. Every advertised non-default resolution must map to a
        // variant.
        for (const model of getModels()) {
            const def = getRegistryModelDefinition(model);
            if (!def.resolutions || def.resolutions.length < 2) continue;
            for (const resolution of def.resolutions.slice(1)) {
                const name = def.selectCostVariant?.({
                    usage: {},
                    input: { resolution },
                });
                expect(
                    name && def.costVariants?.[name],
                    `${model} must have a cost variant for ${resolution}`,
                ).toBeTruthy();
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

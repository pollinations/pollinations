import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { AUDIO_FALLBACKS } from "@shared/registry/audio-fallbacks.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { IMAGE_FALLBACKS } from "@shared/registry/image-fallbacks.ts";
import { mergeFallbacks } from "@shared/registry/merge-fallbacks.ts";
import { MODEL3D_SERVICES } from "@shared/registry/model3d.ts";
import {
    calculateUsageBilling,
    getVisibleAudioModels,
    getVisibleImageModels,
    getVisibleTextModels,
    type ModelDefinition,
} from "@shared/registry/registry.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { TEXT_FALLBACKS } from "@shared/registry/text-fallbacks.ts";
import { describe, expect, it } from "vitest";
import { findModelByName } from "../src/text/availableModels.ts";
import {
    supportsTextFallbackRequest,
    textCapabilityError,
} from "../src/text/fallbackCompatibility.ts";
import { resolveDirectResponsesTarget } from "../src/text/responses/client.ts";

const OPENROUTER_ROUTES = [
    [
        "perplexity/sonar:openrouter:perplexity",
        "perplexity/sonar",
        "perplexity",
    ],
    [
        "perplexity/sonar-pro:openrouter:perplexity",
        "perplexity/sonar-pro",
        "perplexity",
    ],
    [
        "perplexity/sonar-reasoning-pro:openrouter:perplexity",
        "perplexity/sonar-reasoning-pro",
        "perplexity",
    ],
    [
        "qwen/qwen3.8-27b:openrouter:akashml-fp8",
        "qwen/qwen3.8-27b",
        "akashml/fp8",
    ],
    [
        "anthropic/claude-opus-4.7:openrouter:vertex-global",
        "anthropic/claude-opus-4.7",
        "google-vertex/global",
    ],
    [
        "meta/llama-4-scout:openrouter:novita-bf16",
        "meta-llama/llama-4-scout",
        "novita/bf16",
    ],
    ["x-ai/grok-4.20:openrouter:xai-zdr", "x-ai/grok-4.20", "xai/zdr"],
    ["x-ai/grok-4.3:openrouter:xai-zdr", "x-ai/grok-4.3", "xai/zdr"],
    [
        "anthropic/claude-haiku-4.5:openrouter:vertex-global",
        "anthropic/claude-haiku-4.5",
        "google-vertex/global",
    ],
    [
        "anthropic/claude-fable-5:openrouter:vertex-global",
        "anthropic/claude-fable-5",
        "google-vertex/global",
    ],
    [
        "anthropic/claude-opus-5.5:openrouter:anthropic",
        "anthropic/claude-opus-5.5",
        "anthropic",
    ],
    [
        "meta/muse-glimmer-30b:openrouter:together",
        "meta/muse-glimmer-30b",
        "together",
    ],
    [
        "moonshotai/kimi-k2.7-code:openrouter:streamlake",
        "moonshotai/kimi-k2.7-code",
        "streamlake",
    ],
    [
        "deepseek/deepseek-v4-pro:openrouter:streamlake",
        "deepseek/deepseek-v4-pro-0813",
        "streamlake",
    ],
    [
        "deepseek/deepseek-v4.1-flash:openrouter:deepinfra-fp8",
        "deepseek/deepseek-v4.1-flash",
        "deepinfra/fp8",
    ],
    [
        "nvidia/nemotron-3.5-lightning:openrouter:coreweave-bf16",
        "nvidia/nemotron-3.5-lightning",
        "coreweave/bf16",
    ],
    [
        "google/gemini-3-flash-preview:openrouter:vertex-global",
        "google/gemini-3-flash-preview",
        "google-vertex/global",
    ],
    [
        "google/gemini-3.7-flash:openrouter:vertex-global",
        "google/gemini-3.7-flash",
        "google-vertex/global",
    ],
    [
        "google/gemini-3.8-flash:openrouter:vertex-global",
        "google/gemini-3.8-flash",
        "google-vertex/global",
    ],
    [
        "google/gemini-2.5-flash-lite:openrouter:vertex-eu",
        "google/gemini-2.5-flash-lite",
        "google-vertex/eu",
    ],
    [
        "google/gemini-3.5-flash-lite:openrouter:vertex-global",
        "google/gemini-3.5-flash-lite",
        "google-vertex/global",
    ],
    [
        "google/gemini-3.1-pro-preview:openrouter:vertex-global",
        "google/gemini-3.1-pro-preview",
        "google-vertex/global",
    ],
    [
        "qwen/qwen3-vl-235b-a22b-thinking:openrouter:novita-bf16",
        "qwen/qwen3-vl-235b-a22b-thinking",
        "novita/bf16",
    ],
    ["z-ai/glm-5.3:openrouter:friendli", "z-ai/glm-5.3", "friendli"],
    [
        "qwen/qwen3-coder-next:openrouter:streamlake",
        "qwen/qwen3-coder-next",
        "streamlake",
    ],
    ["tencent/hy3:openrouter:phala", "tencent/hy3", "phala"],
] as const;

function fallbackRoutes(fallbacks: Record<string, Record<string, unknown>>) {
    return Object.fromEntries(
        Object.entries(fallbacks).map(([parent, routes]) => [
            parent,
            Object.keys(routes),
        ]),
    );
}

function expectInheritedRoute(
    services: Record<string, ModelDefinition>,
    parentId: string,
    routeId: string,
) {
    const parent = services[parentId];
    const route = services[routeId];
    expect(routeId).toBe(routeId.toLowerCase());
    const routePrefix = `${parentId}:${route.provider}`;
    expect(
        routeId === routePrefix || routeId.startsWith(`${routePrefix}:`),
    ).toBe(true);
    const sameProviderRoutes = (parent.fallbacks ?? []).filter(
        (id) => services[id]?.provider === route.provider,
    ).length;
    if (parent.provider === route.provider || sameProviderRoutes > 1) {
        expect(routeId.startsWith(`${routePrefix}:`)).toBe(true);
        expect(routeId.length).toBeGreaterThan(routePrefix.length + 1);
    }
    expect(parent.fallbacks).toContain(routeId);
    expect(route).toMatchObject({
        aliases: [],
        hidden: true,
        fallbackOnly: true,
        publisher: parent.publisher,
        category: parent.category,
        title: parent.title,
        inputModalities: parent.inputModalities,
        outputModalities: parent.outputModalities,
    });
    expect(route.paidOnly).toBe(parent.paidOnly);
    expect(route.fallbacks).toBeUndefined();
    for (const usageType of Object.keys(route.cost ?? {})) {
        expect(
            parent.cost,
            `${routeId}.${usageType} needs a quoted ${parentId} rate`,
        ).toHaveProperty(usageType);
    }
}

describe("static provider fallbacks", () => {
    it.each([
        "qwen/qwen3.7-flash",
        "qwen/qwen3.8-flash",
        "qwen/qwen3.8-max",
    ])("preserves direct Responses support for %s", (model) => {
        const request = {
            model,
            input: "Hello",
            stream: false,
            store: false as const,
            safe: undefined,
        };
        expect(resolveDirectResponsesTarget(model, request)).toMatchObject({
            endpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses",
            model: model.slice("qwen/".length),
        });
        expect(
            resolveDirectResponsesTarget(
                `${model}:openrouter:alibaba`,
                request,
            ),
        ).toMatchObject({
            endpoint: "https://openrouter.ai/api/v1/responses",
            model,
        });
    });

    it("keeps Mistral Large on Azure and bills its direct fallback at the public quote", () => {
        const model = "mistralai/mistral-large-3";
        const primary = TEXT_SERVICES[model];
        const fallback = TEXT_SERVICES[`${model}:mistral`];
        expect(primary.provider).toBe("azure");
        expect(primary.fallbacks).toEqual([`${model}:mistral`]);
        expect(fallback.provider).toBe("mistral");
        expect(fallback.paidOnly).not.toBe(true);
        expect(findModelByName(model)?.config()).toMatchObject({
            "azure-resource-name": "myceli-prod-eastus",
            "azure-deployment-id": "Mistral-Large-3",
        });
        expect(findModelByName(`${model}:mistral`)?.config()).toMatchObject({
            "custom-host": "https://api.mistral.ai/v1",
            model: "mistral-large-2512",
        });
        const billed = calculateUsageBilling({
            model,
            usage: {
                promptTextTokens: 1_000,
                promptCachedTokens: 200,
                completionTextTokens: 100,
            },
            servedBy: fallback,
            quotedBy: primary,
        });
        const cost = 0.001 * 0.5 + 0.0002 * 0.05 + 0.0001 * 1.5;
        expect(billed.cost.totalCost).toBeCloseTo(cost, 12);
        expect(billed.price.totalPrice).toBeCloseTo(cost * 0.75, 8);
    });

    it("preserves seeded requests on the direct Mistral fallback", async () => {
        const route = findModelByName("mistralai/mistral-large-3:mistral");
        const options = { seed: 0, reasoning_effort: "high", temperature: 0.2 };
        const result = await route?.transform?.([], options);
        expect(result?.options).toEqual({ random_seed: 0, temperature: 0.2 });
        expect(options.seed).toBe(0);
        const unseeded = await route?.transform?.([], { temperature: 0.2 });
        expect(unseeded?.options).toEqual({ temperature: 0.2 });
    });

    it("keeps the Gemini quote while recording direct and OpenRouter costs", () => {
        const primary = TEXT_SERVICES["google/gemini-3.1-pro-preview"];
        const fallback =
            TEXT_SERVICES[
                "google/gemini-3.1-pro-preview:openrouter:vertex-global"
            ];
        expect(primary.priceMultiplier).toBe(1.055);
        expect(fallback.priceMultiplier).toBe(1);
        for (const definition of [primary, fallback]) {
            const billed = calculateUsageBilling({
                model: "google/gemini-3.1-pro-preview",
                usage: {
                    promptTextTokens: 200_000,
                    completionTextTokens: 1_000,
                },
                servedBy: definition,
                quotedBy: primary,
                output:
                    definition.provider === "openrouter"
                        ? {
                              usage: {
                                  server_tool_use_details: {
                                      web_search_requests: 1,
                                  },
                              },
                          }
                        : {
                              choices: [
                                  {
                                      groundingMetadata: {
                                          webSearchQueries: ["latest"],
                                      },
                                  },
                              ],
                          },
            });
            const directCost = 0.2 * 4 + 0.001 * 18 + 0.014;
            const expectedCost =
                definition.provider === "openrouter"
                    ? directCost * 1.055
                    : directCost;
            expect(billed.cost.totalCost).toBeCloseTo(expectedCost, 12);
            expect(billed.price.totalPrice).toBeCloseTo(directCost * 1.055, 8);
            expect(billed.priceDefinition.promptTextTokens).toBe(
                (4 / 1_000_000) * 1.055,
            );
        }
    });

    it.each([
        "sonar",
        "sonar-pro",
        "sonar-reasoning-pro",
    ] as const)("keeps %s on direct Perplexity with an OpenRouter fallback", (upstream) => {
        const model = `perplexity/${upstream}` as const;
        const primary: ModelDefinition = TEXT_SERVICES[model];
        expect(primary).toMatchObject({
            provider: "perplexity",
            priceMultiplier: 1,
            fallbacks: [`${model}:openrouter:perplexity`],
        });
        expect(primary).not.toHaveProperty("paidOnly", true);
        expect(findModelByName(model)?.config()).toMatchObject({
            provider: "perplexity-ai",
            model: upstream,
        });
    });

    it.each([
        ["perplexity/sonar", "low", 0.005],
        ["perplexity/sonar", "high", 0.012],
        ["perplexity/sonar-pro", "high", 0.014],
        ["perplexity/sonar-reasoning-pro", "high", 0.014],
    ] as const)("bills %s %s search once when OpenRouter reports a total cost", (model, searchContextSize, searchFee) => {
        const primary = TEXT_SERVICES[model];
        const fallback = TEXT_SERVICES[`${model}:openrouter:perplexity`];
        const usage = { promptTextTokens: 100, completionTextTokens: 20 };
        const expected =
            100 * primary.cost.promptTextTokens +
            20 * primary.cost.completionTextTokens +
            searchFee;
        // OpenRouter's numeric cost already includes token and search costs.
        const completion = { usage: { cost: expected } };
        for (const output of [
            completion,
            { streamEvents: [{ choices: [] }, completion] },
        ]) {
            const billed = calculateUsageBilling({
                model,
                usage,
                servedBy: fallback,
                quotedBy: primary,
                output,
                input: { searchContextSize },
            });
            expect(billed.cost.totalCost).toBeCloseTo(expected * 1.055, 12);
            expect(billed.price.totalPrice).toBeCloseTo(expected, 12);
            expect(billed.adjustments).toHaveLength(1);
            expect(billed.adjustments[0]).toMatchObject({
                kind: "search_request",
                units: 1,
                cost: searchFee * 1.055,
            });
        }
    });

    it("uses the identical Sweden checkpoint as the GPT-5.3 Codex fallback", () => {
        const primary = TEXT_SERVICES["openai/gpt-5.3-codex"];
        const fallback = TEXT_SERVICES["openai/gpt-5.3-codex:azure:sweden"];
        expect(primary).toMatchObject({
            provider: "azure",
            aliases: [],
            fallbacks: ["openai/gpt-5.3-codex:azure:sweden"],
            priceMultiplier: 0.75,
            maxCompletionTokens: 128000,
        });
        expect(fallback).toMatchObject({
            provider: "azure",
            fallbackOnly: true,
            hidden: true,
            aliases: [],
        });
        expect(primary).not.toHaveProperty("paidOnly", true);
        expect(fallback.paidOnly).not.toBe(true);
        expect(fallback.cost).toEqual(primary.cost);

        const billing = calculateUsageBilling({
            model: "openai/gpt-5.3-codex",
            usage: {
                promptTextTokens: 10,
                promptCachedTokens: 4,
                promptCacheWriteTokens: 2,
                completionTextTokens: 5,
            },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.0000917, 12);
        expect(billing.price.totalPrice).toBe(0.00006877);
        expect(billing.price.totalPrice).toBe(billing.servedPrice);
    });

    it("preserves the Astra quote while recording Data Zone costs", () => {
        const primary = TEXT_SERVICES["openai/gpt-6-astra"];
        const fallback = TEXT_SERVICES["openai/gpt-6-astra:azure:datazone"];
        expect(primary.cost).toEqual({
            promptTextTokens: 10 / 1_000_000,
            promptCachedTokens: 1 / 1_000_000,
            promptCacheWriteTokens: 12.5 / 1_000_000,
            completionTextTokens: 50 / 1_000_000,
        });
        expect(fallback.cost).toEqual({
            promptTextTokens: 11 / 1_000_000,
            promptCachedTokens: 1.1 / 1_000_000,
            promptCacheWriteTokens: 13.75 / 1_000_000,
            completionTextTokens: 55 / 1_000_000,
        });
        expect(fallback.costVariants?.long_context).toEqual({
            promptTextTokens: 22 / 1_000_000,
            promptCachedTokens: 2.2 / 1_000_000,
            promptCacheWriteTokens: 27.5 / 1_000_000,
            completionTextTokens: 82.5 / 1_000_000,
        });
        expect(fallback.selectCostVariant).toBe(primary.selectCostVariant);
        expect(
            fallback.selectCostVariant?.({
                usage: { promptTextTokens: 272_000 },
            }),
        ).toBeUndefined();
        expect(
            fallback.selectCostVariant?.({
                usage: { promptTextTokens: 272_000, promptCachedTokens: 1 },
            }),
        ).toBe("long_context");
        expect(fallback.priceMultiplier).toBe(0.75);
        expect(fallback.paidOnly).not.toBe(true);
        const billing = calculateUsageBilling({
            model: "openai/gpt-6-astra",
            usage: { promptTextTokens: 11, completionTextTokens: 5 },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.000396, 12);
        expect(billing.price.totalPrice).toBe(0.00027);
        const model = findModelByName("openai/gpt-6-astra:azure:datazone");
        expect(model?.useResponsesApi).toBe(true);
        expect(model?.config()).toMatchObject({
            "azure-deployment-id": "gpt-6-astra-datazone",
            "azure-resource-name": "myceli-prod-eastus",
            responsesEndpoint:
                "https://myceli-prod-eastus.openai.azure.com/openai/v1/responses",
        });
    });

    it("uses Fal first for Grok Video Pro without changing prices or access", () => {
        const primary = IMAGE_SERVICES["x-ai/grok-imagine-video"];
        const fallback = IMAGE_SERVICES["x-ai/grok-imagine-video:openrouter"];
        expect(primary).toMatchObject({
            provider: "fal",
            paidOnly: true,
            priceMultiplier: 1,
            aliases: ["grok-imagine-video", "grok-video-pro"],
            fallbacks: ["x-ai/grok-imagine-video:openrouter"],
            cost: { promptImageTokens: 0.002, completionVideoSeconds: 0.07 },
        });
        expect(fallback.provider).toBe("openrouter");
        expect(fallback.cost).toEqual({
            promptImageTokens: 0.002 * 1.055,
            completionVideoSeconds: 0.07 * 1.055,
        });
        expect(IMAGE_SERVICES).not.toHaveProperty(
            "x-ai/grok-imagine-video:fal",
        );
        expect(IMAGE_SERVICES["x-ai/grok-imagine-video-1.5"]).toMatchObject({
            provider: "openrouter",
            fallbacks: ["x-ai/grok-imagine-video-1.5:fal"],
        });
    });

    it("keeps same-provider routes distinct and ordered under a suffixed public ID", () => {
        const parentId = "google/gemini-2.5-flash-lite:search";
        const parent: ModelDefinition = TEXT_SERVICES[parentId];
        const studioId = `${parentId}:openrouter:ai-studio`;
        const vertexId = `${parentId}:openrouter:vertex`;
        const services = mergeFallbacks(
            { [parentId]: parent },
            {
                [parentId]: {
                    [studioId]: { provider: "openrouter" },
                    [vertexId]: { provider: "openrouter" },
                },
            },
        );

        expect(Object.keys(services)).toEqual([parentId, studioId, vertexId]);
        expect(services[parentId]).toEqual({
            ...parent,
            fallbacks: [studioId, vertexId],
        });
        for (const routeId of [studioId, vertexId] as const) {
            expectInheritedRoute(services, parentId, routeId);
            expect(services[routeId].provider).toBe("openrouter");
            expect(services[routeId].cost).toEqual(parent.cost);
        }
        expect(parent.fallbacks).toBeUndefined();
    });

    it("keeps a retirement date on the route that states it", () => {
        const parentId = "google/gemini-2.5-flash-lite:search";
        const parent: ModelDefinition = {
            ...TEXT_SERVICES[parentId],
            retirementDate: Date.UTC(2026, 9, 20),
        };
        const undatedId = `${parentId}:openrouter:ai-studio`;
        const datedId = `${parentId}:openrouter:vertex`;
        const services = mergeFallbacks(
            { [parentId]: parent },
            {
                [parentId]: {
                    [undatedId]: { provider: "openrouter" },
                    [datedId]: {
                        provider: "openrouter",
                        retirementDate: Date.UTC(2027, 2, 15),
                    },
                },
            },
        );

        expect(services[parentId].retirementDate).toBe(Date.UTC(2026, 9, 20));
        expect(services[undatedId].retirementDate).toBeUndefined();
        expect(services[datedId].retirementDate).toBe(Date.UTC(2027, 2, 15));
    });

    it("registers exact text routes as fallback-only inherited models", () => {
        for (const [parent, routes] of Object.entries(
            fallbackRoutes(TEXT_FALLBACKS),
        )) {
            expect(
                (TEXT_SERVICES as Record<string, ModelDefinition>)[parent]
                    .fallbacks,
            ).toEqual(routes);
            for (const route of routes) {
                expectInheritedRoute(TEXT_SERVICES, parent, route);
                expect(findModelByName(route)).not.toBeNull();
            }
        }
    });

    it("registers image and 3D routes without public aliases", () => {
        for (const [parent, routes] of Object.entries(
            fallbackRoutes(IMAGE_FALLBACKS),
        )) {
            for (const route of routes) {
                expectInheritedRoute(IMAGE_SERVICES, parent, route);
            }
        }
        for (const [parent, routes] of Object.entries(
            fallbackRoutes(AUDIO_FALLBACKS),
        )) {
            for (const route of routes) {
                expectInheritedRoute(AUDIO_SERVICES, parent, route);
            }
        }
        expectInheritedRoute(
            MODEL3D_SERVICES,
            "microsoft/trellis-2",
            "microsoft/trellis-2:fal",
        );
    });

    it("keeps provider routes out of public model lists", () => {
        const publicText = new Set<string>(getVisibleTextModels());
        const publicImage = new Set<string>(getVisibleImageModels());
        const publicAudio = new Set<string>(getVisibleAudioModels());
        for (const routes of Object.values(fallbackRoutes(TEXT_FALLBACKS))) {
            for (const route of routes)
                expect(publicText.has(route)).toBe(false);
        }
        for (const routes of Object.values(fallbackRoutes(IMAGE_FALLBACKS))) {
            for (const route of routes)
                expect(publicImage.has(route)).toBe(false);
        }
        for (const routes of Object.values(fallbackRoutes(AUDIO_FALLBACKS))) {
            for (const route of routes)
                expect(publicAudio.has(route)).toBe(false);
        }
    });

    it("keeps exact provider route costs", () => {
        expect(TEXT_SERVICES["openai/gpt-4o-mini"].cost).toMatchObject({
            promptTextTokens: (0.15 / 1_000_000) * 1.055,
            promptCachedTokens: (0.075 / 1_000_000) * 1.055,
            completionTextTokens: (0.6 / 1_000_000) * 1.055,
        });
        expect(TEXT_SERVICES["x-ai/grok-4.6"].fallbacks).toEqual([
            "x-ai/grok-4.6:azure:sweden",
            "x-ai/grok-4.6:xai",
        ]);
        expect(TEXT_SERVICES["x-ai/grok-4.6:azure:sweden"].cost).toEqual(
            TEXT_SERVICES["x-ai/grok-4.6"].cost,
        );
        expect(
            TEXT_SERVICES["deepseek/deepseek-v4-flash:deepinfra"].cost,
        ).toMatchObject({
            promptTextTokens: 0.06 / 1_000_000,
            promptCachedTokens: 0.015 / 1_000_000,
            completionTextTokens: 0.18 / 1_000_000,
        });
        expect(
            TEXT_SERVICES[
                "deepseek/deepseek-v4.1-flash:openrouter:deepinfra-fp8"
            ].cost,
        ).toMatchObject({
            promptTextTokens: (0.14 / 1_000_000) * 1.055,
            promptCachedTokens: (0.0042 / 1_000_000) * 1.055,
            completionTextTokens: (0.42 / 1_000_000) * 1.055,
        });
        expect(TEXT_SERVICES["qwen/qwen3.8-27b"].cost).toMatchObject({
            promptTextTokens: (0.24 / 1_000_000) * 1.055,
            promptCachedTokens: (0.024 / 1_000_000) * 1.055,
            promptImageTokens: (0.24 / 1_000_000) * 1.055,
            promptVideoTokens: (0.24 / 1_000_000) * 1.055,
            completionTextTokens: (2.2 / 1_000_000) * 1.055,
        });
        expect(
            TEXT_SERVICES["qwen/qwen3.8-27b:openrouter:akashml-fp8"].cost,
        ).toMatchObject({
            promptTextTokens: (0.25 / 1_000_000) * 1.055,
            promptCachedTokens: (0.05 / 1_000_000) * 1.055,
            promptImageTokens: (0.25 / 1_000_000) * 1.055,
            promptVideoTokens: (0.25 / 1_000_000) * 1.055,
            completionTextTokens: (2.2 / 1_000_000) * 1.055,
        });
        expect(
            TEXT_SERVICES[
                "nvidia/nemotron-3.5-lightning:openrouter:coreweave-bf16"
            ].cost,
        ).toMatchObject({
            promptTextTokens: (0.07 / 1_000_000) * 1.055,
            promptCachedTokens: (0.04 / 1_000_000) * 1.055,
            completionTextTokens: (0.2 / 1_000_000) * 1.055,
        });
        expect(
            TEXT_SERVICES["meta/llama-4-scout:openrouter:novita-bf16"].cost,
        ).toMatchObject({
            promptTextTokens: (0.18 / 1_000_000) * 1.055,
            promptImageTokens: (0.18 / 1_000_000) * 1.055,
            completionTextTokens: (0.59 / 1_000_000) * 1.055,
        });
        expect(
            IMAGE_SERVICES["qwen/qwen-image-3:replicate"].cost,
        ).toMatchObject({
            promptImageTokens: 0,
            completionImageTokens: 0.03,
        });
        expect(
            TEXT_SERVICES["google/gemini-3.7-flash:openrouter:vertex-global"]
                .cost,
        ).toMatchObject({
            promptCacheWriteTokens: (0.75 / 1_000_000) * 1.055,
        });
        expect(
            TEXT_SERVICES[
                "google/gemini-3.5-flash-lite:openrouter:vertex-global"
            ].cost,
        ).toMatchObject({
            promptCacheWriteTokens: (0.3 / 1_000_000) * 1.055,
        });
        expect(
            TEXT_SERVICES["moonshotai/kimi-k2.7-code:openrouter:streamlake"]
                .cost,
        ).toMatchObject({
            promptCacheWriteTokens: (0.7125 / 1_000_000) * 1.055,
        });
        expect(MODEL3D_SERVICES["microsoft/trellis-2:fal"].cost).toEqual({
            completionImageTokens: 0.25,
        });
    });

    it("shares Scout capabilities and pricing across its two routes", () => {
        const primary = TEXT_SERVICES["meta/llama-4-scout"];
        const route =
            TEXT_SERVICES["meta/llama-4-scout:openrouter:novita-bf16"];
        expect(primary).toMatchObject({
            tools: false,
            contextLength: 131072,
            paidOnly: true,
            priceMultiplier: 1,
        });
        expect(primary.cost.promptTextTokens).toBe(0.1 / 1_000_000);
        expect(
            supportsTextFallbackRequest(route, {
                messages: [{ role: "user", content: "Hello" }],
                stream: true,
                max_tokens: 128,
            }),
        ).toBe(true);
        expect(supportsTextFallbackRequest(route, { max_tokens: 16384 })).toBe(
            true,
        );
        for (const field of [
            "max_tokens",
            "max_completion_tokens",
            "max_output_tokens",
        ]) {
            expect(supportsTextFallbackRequest(route, { [field]: 16385 })).toBe(
                false,
            );
        }
        const images = (count: number) => ({
            messages: [
                {
                    role: "user",
                    content: Array.from({ length: count }, () => ({
                        type: "image_url",
                        image_url: { url: "https://example.com/image.png" },
                    })),
                },
            ],
        });
        expect(supportsTextFallbackRequest(route, images(10))).toBe(true);
        expect(supportsTextFallbackRequest(route, images(11))).toBe(false);
    });

    it.each([
        { tools: [{ type: "function", function: { name: "weather" } }] },
        { tool_choice: "required" },
        { functions: [{ name: "weather" }] },
        { function_call: { name: "weather" } },
        { response_format: { type: "json_object" } },
        {
            response_format: {
                type: "json_schema",
                json_schema: { name: "answer" },
            },
        },
        { text: { format: { type: "json_object" } } },
        {
            messages: [
                {
                    role: "assistant",
                    tool_calls: [
                        {
                            type: "function",
                            function: { name: "weather", arguments: "{}" },
                        },
                    ],
                },
            ],
        },
        {
            messages: [
                { role: "tool", content: "sunny", tool_call_id: "call_1" },
            ],
        },
        { messages: [{ role: "function", name: "weather", content: "sunny" }] },
        {
            input: [
                {
                    type: "function_call",
                    name: "weather",
                    arguments: "{}",
                    call_id: "call_1",
                },
            ],
        },
        {
            input: [
                {
                    type: "function_call_output",
                    call_id: "call_1",
                    output: "sunny",
                },
            ],
        },
    ])("rejects unsupported Scout capabilities on both routes: %j", (request) => {
        const before = JSON.stringify(request);
        expect(
            textCapabilityError(TEXT_SERVICES["meta/llama-4-scout"], request),
        ).toMatch(/does not support/);
        expect(
            supportsTextFallbackRequest(
                TEXT_SERVICES["meta/llama-4-scout:openrouter:novita-bf16"],
                request,
            ),
        ).toBe(false);
        expect(JSON.stringify(request)).toBe(before);
        expect(
            supportsTextFallbackRequest(
                TEXT_SERVICES["meta/llama-4-scout"],
                request,
            ),
        ).toBe(false);
    });

    it.each([
        { tool_choice: "auto" },
        { tool_choice: "none" },
        { function_call: "auto", functions: [] },
        { tools: [], parallel_tool_calls: false },
        { tools: [], parallel_tool_calls: true },
        { parallel_tool_calls: true },
        { logit_bias: {} },
        { response_format: { type: "text" } },
        { text: { format: { type: "text" } } },
        { messages: [{ role: "user", content: "hello ".repeat(60000) }] },
        {
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_image",
                            image_url: `data:image/png;base64,${"a".repeat(100000)}`,
                        },
                    ],
                },
            ],
        },
        {
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: '{"type":"function_call"}' },
                    ],
                },
            ],
        },
    ])("allows defaults and large payloads through Novita (case %#)", (request) => {
        expect(
            supportsTextFallbackRequest(
                TEXT_SERVICES["meta/llama-4-scout:openrouter:novita-bf16"],
                request,
            ),
        ).toBe(true);
    });

    it("uses the same primary and single fallback for both API formats", () => {
        const primary = "meta/llama-4-scout";
        const novita = `${primary}:openrouter:novita-bf16`;
        expect(TEXT_SERVICES[primary].fallbacks).toEqual([novita]);
        expect(findModelByName(primary)?.config()).toMatchObject({
            model: "meta/llama-4-scout",
            directEndpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
            defaultOptions: {
                providerOptions: { gateway: { only: ["deepinfra"] } },
            },
        });
        const request = {
            model: primary,
            input: "Hello",
            stream: false,
            store: false as const,
            safe: undefined,
        };
        expect(resolveDirectResponsesTarget(primary, request)).toMatchObject({
            endpoint: "https://ai-gateway.vercel.sh/v1/responses",
            defaults: { providerOptions: { gateway: { only: ["deepinfra"] } } },
        });
        expect(resolveDirectResponsesTarget(novita, request)).toMatchObject({
            endpoint: "https://openrouter.ai/api/v1/responses",
            defaults: {
                provider: { only: ["novita/bf16"], allow_fallbacks: false },
            },
        });
    });

    it("binds fallback-only text ids to their exact provider routes", () => {
        expect(
            findModelByName("x-ai/grok-4.6:azure:sweden")?.config(),
        ).toMatchObject({
            provider: "openai",
            model: "grok-4.6",
            directAuthHeader: "api-key",
            directEndpoint:
                "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/grok-4.6/chat/completions?api-version=2024-12-01-preview",
            responsesEndpoint:
                "https://myceli-prod-swedencentral.openai.azure.com/openai/v1/responses",
            responsesAuthHeader: "api-key",
        });
        expect(findModelByName("x-ai/grok-4.6:xai")?.config()).toMatchObject({
            provider: "openai",
            directEndpoint: "https://api.x.ai/v1/chat/completions",
            model: "grok-4.6",
        });
        expect(
            findModelByName("deepseek/deepseek-v4-flash:deepinfra")?.config(),
        ).toMatchObject({
            "custom-host": "https://api.deepinfra.com/v1/openai",
            model: "deepseek-ai/DeepSeek-V4-Flash-0731",
        });
        expect(findModelByName("qwen/qwen3.7-flash")?.config()).toMatchObject({
            directEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            model: "qwen3.7-flash",
            defaultOptions: { max_tokens: 64000 },
        });
        expect(findModelByName("qwen/qwen3.8-flash")?.config()).toMatchObject({
            directEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            model: "qwen3.8-flash",
            defaultOptions: { max_tokens: 64000 },
        });
        for (const [unit, cost] of Object.entries(
            TEXT_SERVICES["qwen/qwen3.8-flash"].cost,
        )) {
            expect(
                TEXT_SERVICES["qwen/qwen3.8-flash:openrouter:alibaba"].cost[
                    unit as keyof (typeof TEXT_SERVICES)["qwen/qwen3.8-flash"]["cost"]
                ],
            ).toBeCloseTo(cost * 1.055, 15);
        }
        expect(
            findModelByName("mistralai/mistral-small-3.2:deepinfra")?.config(),
        ).toMatchObject({
            "custom-host": "https://api.deepinfra.com/v1/openai",
            model: "mistralai/Mistral-Small-3.2-24B-Instruct-2506",
        });
        expect(
            findModelByName("mistralai/mistral-small-4")?.config(),
        ).toMatchObject({
            "custom-host": "https://api.mistral.ai/v1",
            model: "mistral-small-2603",
            defaultOptions: { max_tokens: 64000 },
        });
        expect(
            findModelByName("mistralai/mistral-small-4:openrouter")?.config(),
        ).toMatchObject({
            provider: "openrouter",
            model: "mistralai/mistral-small-2603",
            defaultOptions: { max_tokens: 64000 },
        });
        for (const [unit, cost] of Object.entries(
            TEXT_SERVICES["mistralai/mistral-small-4"].cost,
        )) {
            expect(
                TEXT_SERVICES["mistralai/mistral-small-4:openrouter"].cost[
                    unit as keyof (typeof TEXT_SERVICES)["mistralai/mistral-small-4"]["cost"]
                ],
            ).toBeCloseTo(cost * 1.055, 15);
        }
        for (const [route, model, provider] of OPENROUTER_ROUTES) {
            expect(findModelByName(route)?.config()).toMatchObject({
                model,
                defaultOptions: {
                    provider: {
                        only: [provider],
                        allow_fallbacks: false,
                    },
                },
            });
        }
    });
});

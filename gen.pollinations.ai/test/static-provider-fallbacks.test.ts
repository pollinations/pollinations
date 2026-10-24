import { env } from "cloudflare:test";
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
import { createBedrockNativeConfig } from "../src/text/configs/providerConfigs.ts";
import { syncTextEnvironment } from "../src/text/environment.ts";
import {
    supportsTextFallbackRequest,
    textCapabilityError,
} from "../src/text/fallbackCompatibility.ts";
import { resolveDirectResponsesTarget } from "../src/text/responses/client.ts";

const OPENROUTER_ROUTES = [
    ["qwen/qwen3.8-27b:openrouter:reka-fp8", "qwen/qwen3.8-27b", "reka/fp8"],
    [
        "anthropic/claude-opus-4.7:openrouter:vertex-global",
        "anthropic/claude-opus-4.7",
        "google-vertex/global",
    ],
    [
        "meta/llama-4-scout:openrouter:deepinfra-fp8-priority",
        "meta-llama/llama-4-scout",
        "deepinfra/fp8/priority",
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
        "nvidia/nemotron-3.5-lightning:openrouter:coreweave-bf16",
        "nvidia/nemotron-3.5-lightning",
        "coreweave/bf16",
    ],
    [
        "nvidia/nemotron-3.5-super-vl:openrouter:together",
        "nvidia/nemotron-3.5-super-vl",
        "together",
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
        "google/gemini-4-argon:openrouter:ai-studio",
        "google/gemini-4-argon",
        "google-ai-studio",
    ],
    [
        "google/gemini-2.5-flash-lite:openrouter:ai-studio",
        "google/gemini-2.5-flash-lite",
        "google-ai-studio",
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
    it("keeps HY3 on its primary without a same-gateway fallback", () => {
        expect(TEXT_SERVICES["tencent/hy3"]).not.toHaveProperty("fallbacks");
        expect(TEXT_SERVICES).not.toHaveProperty(
            "tencent/hy3:openrouter:phala",
        );
    });

    it("uses current Worker bindings for AWS and DeepInfra fallback credentials", () => {
        try {
            syncTextEnvironment({
                ...env,
                AWS_ACCESS_KEY_ID: "local-binding-id",
                AWS_SECRET_ACCESS_KEY: "not-a-secret-test-only",
                AWS_REGION: "eu-west-1",
                DEEPINFRA_API_KEY: "not-a-secret-local-deepinfra-binding",
            });
            expect(createBedrockNativeConfig()).toMatchObject({
                "aws-access-key-id": "local-binding-id",
                "aws-secret-access-key": "not-a-secret-test-only",
                "aws-region": "eu-west-1",
            });
            expect(
                findModelByName("z-ai/glm-5.3:deepinfra")?.config(),
            ).toMatchObject({
                authKey: "not-a-secret-local-deepinfra-binding",
            });
        } finally {
            syncTextEnvironment(env);
        }
    });

    it.each([
        ["anthropic/claude-haiku-5.5", "claude-haiku-5-5"],
        ["anthropic/claude-sonnet-5.5", "claude-sonnet-5-5"],
        ["anthropic/claude-opus-5.5", "claude-opus-5-5"],
        ["anthropic/claude-fable-5.1", "claude-fable-5-1"],
    ] as const)(
        "tries direct Anthropic before AWS for %s",
        (model, upstream) => {
            const primary: ModelDefinition = TEXT_SERVICES[model];
            const fallback: ModelDefinition = TEXT_SERVICES[`${model}:aws`];
            expect(primary.provider).toBe("anthropic");
            expect(primary.fallbacks).toEqual([`${model}:aws`]);
            expect(fallback).toMatchObject({
                provider: "aws",
                hidden: true,
                fallbackOnly: true,
                aliases: [],
            });
            expect(fallback.cost).toEqual(primary.cost);
            expect(fallback.costVariants).toEqual(primary.costVariants);
            for (const servedBy of [primary, fallback]) {
                const billing = calculateUsageBilling({
                    model,
                    usage: {
                        promptTextTokens: 1000,
                        promptCachedTokens: 500,
                        promptCacheWriteTokens: 200,
                        completionTextTokens: 100,
                    },
                    servedBy,
                    quotedBy: primary,
                });
                expect(billing.price.totalPrice).toBeCloseTo(
                    billing.cost.totalCost * 0.75,
                    12,
                );
            }
            expect(findModelByName(model)?.config()).toMatchObject({
                provider: "anthropic",
                model: upstream,
                defaultOptions: { max_tokens: 128000 },
            });
            expect(findModelByName(`${model}:aws`)?.config()).toMatchObject({
                provider: "bedrock",
                model: `global.anthropic.${upstream}`,
                defaultOptions: { max_tokens: 128000 },
            });
            expect(getVisibleTextModels()).not.toContain(`${model}:aws`);
        },
    );

    it("tries Bedrock before direct Anthropic for Claude Sonnet 5", () => {
        const model = "anthropic/claude-sonnet-5";
        const primary: ModelDefinition = TEXT_SERVICES[model];
        const fallback: ModelDefinition = TEXT_SERVICES[`${model}:anthropic`];
        expect(primary.provider).toBe("aws");
        expect(primary.fallbacks).toEqual([`${model}:anthropic`]);
        expect(fallback).toMatchObject({
            provider: "anthropic",
            hidden: true,
            fallbackOnly: true,
            aliases: [],
        });
        expect(fallback.cost).toEqual(primary.cost);
        expect(findModelByName(`${model}:anthropic`)?.config()).toMatchObject({
            provider: "anthropic",
            model: "claude-sonnet-5",
            defaultOptions: { max_tokens: 64000 },
        });
        expect(getVisibleTextModels()).not.toContain(`${model}:anthropic`);
    });

    it("tries direct DeepInfra before OpenRouter for GLM 5.3 at the primary's user price", () => {
        const model = "z-ai/glm-5.3";
        const route = `${model}:deepinfra`;
        expect(TEXT_SERVICES[model].provider).toBe("fireworks");
        expect(TEXT_SERVICES[model].fallbacks).toEqual([
            route,
            `${model}:openrouter:friendli`,
        ]);
        expect(TEXT_SERVICES[route]).toMatchObject({
            provider: "deepinfra",
            hidden: true,
            fallbackOnly: true,
            paidOnly: false,
            aliases: [],
        });
        expect(findModelByName(route)?.config()).toMatchObject({
            model: "zai-org/GLM-5.3",
            directEndpoint:
                "https://api.deepinfra.com/v1/openai/chat/completions",
            defaultOptions: { max_tokens: 64000 },
        });
        expect(getVisibleTextModels()).not.toContain(route);
        const usage = {
            promptTextTokens: 1000,
            promptCachedTokens: 2000,
            completionTextTokens: 100,
        };
        const billing = calculateUsageBilling({
            model,
            usage,
            servedBy: TEXT_SERVICES[route],
            quotedBy: TEXT_SERVICES[model],
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.0010625, 10);
        expect(billing.price.totalPrice).toBeCloseTo(0.00236, 10);
        const openRouterBilling = calculateUsageBilling({
            model,
            usage,
            servedBy: TEXT_SERVICES[`${model}:openrouter:friendli`],
            quotedBy: TEXT_SERVICES[model],
        });
        expect(openRouterBilling.cost.totalCost).toBeCloseTo(0.00224082, 10);
        expect(openRouterBilling.price.totalPrice).toBeCloseTo(
            billing.price.totalPrice,
            10,
        );
    });

    it("records MiMo V2.6 Flash's discounted backup cost and keeps the Novita quote", () => {
        const model = "xiaomi/mimo-v2.6-flash";
        const billed = calculateUsageBilling({
            model,
            usage: {
                promptTextTokens: 1000,
                promptCachedTokens: 200,
                completionTextTokens: 100,
            },
            servedBy: TEXT_SERVICES[`${model}:deepinfra`],
            quotedBy: TEXT_SERVICES[model],
        });
        expect(billed.cost.totalCost).toBeCloseTo(0.000109564, 12);
        expect(billed.price.totalPrice).toBe(0.00016856);
    });

    it("lets OpenRouter recover GLM Flash across independent providers", () => {
        const model = "z-ai/glm-5.3-flash";
        const route = `${model}:openrouter`;
        expect(TEXT_SERVICES[model].provider).toBe("fireworks");
        expect(TEXT_SERVICES[model].fallbacks).toEqual([route]);
        expect(findModelByName(route)?.config()).toMatchObject({
            provider: "openrouter",
            model,
            defaultOptions: {
                max_tokens: 64000,
                provider: {
                    only: [
                        "together",
                        "baseten/fp8",
                        "modal/nvfp4",
                        "crusoe/fp4",
                        "friendli",
                        "digitalocean",
                        "parasail/fp4",
                        "venice",
                    ],
                    allow_fallbacks: true,
                },
            },
        });
        expect(TEXT_SERVICES[route].cost).toMatchObject({
            promptTextTokens: (0.15 / 1_000_000) * 1.055,
            promptCachedTokens: (0.03 / 1_000_000) * 1.055,
            completionTextTokens: (0.5 / 1_000_000) * 1.055,
        });
    });

    it.each(["qwen/qwen3.7-flash", "qwen/qwen3.8-flash", "qwen/qwen3.8-max"])(
        "preserves direct Responses support for %s",
        (model) => {
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
        },
    );

    it("keeps the Azure Kimi K2.6 quote on direct DeepInfra recovery", () => {
        const model = "moonshotai/kimi-k2.6";
        const primary = TEXT_SERVICES[model];
        const fallback = TEXT_SERVICES["moonshotai/kimi-k2.6:deepinfra"];
        expect(primary.fallbacks).toEqual(["moonshotai/kimi-k2.6:deepinfra"]);
        expect(primary.priceMultiplier).toBe(1);
        const billed = calculateUsageBilling({
            model,
            usage: {
                promptTextTokens: 100,
                promptCachedTokens: 20,
                promptImageTokens: 10,
                completionTextTokens: 30,
            },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(billed.cost.totalCost).toBeCloseTo(0.0001905, 12);
        expect(billed.price.totalPrice).toBe(0.0002277);
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

    it("tries Bedrock before direct Anthropic for Claude Opus 5", () => {
        const model = "anthropic/claude-opus-5";
        const primary: ModelDefinition = TEXT_SERVICES[model];
        const fallback: ModelDefinition = TEXT_SERVICES[`${model}:anthropic`];
        expect(primary.provider).toBe("aws");
        expect(primary.fallbacks).toEqual([`${model}:anthropic`]);
        expect(fallback).toMatchObject({
            provider: "anthropic",
            hidden: true,
            fallbackOnly: true,
            aliases: [],
        });
        expect(fallback.cost).toEqual(primary.cost);
        expect(findModelByName(`${model}:anthropic`)?.config()).toMatchObject({
            provider: "anthropic",
            model: "claude-opus-5",
            defaultOptions: { max_tokens: 128000 },
        });
        expect(getVisibleTextModels()).not.toContain(`${model}:anthropic`);
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
        expect(primary.priceMultiplier).toBe(1);
        expect(fallback.priceMultiplier).toBe(1);
        for (const definition of [primary, fallback]) {
            const billed = calculateUsageBilling({
                model: "google/gemini-3.1-pro-preview",
                usage: {
                    promptTextTokens: 250_000,
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
            const directCost = 0.25 * 4 + 0.001 * 18 + 0.014;
            const expectedCost =
                definition.provider === "openrouter"
                    ? directCost * 1.055
                    : directCost;
            expect(billed.cost.totalCost).toBeCloseTo(expectedCost, 12);
            expect(billed.price.totalPrice).toBeCloseTo(directCost, 8);
            expect(billed.priceDefinition.promptTextTokens).toBe(4 / 1_000_000);
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
        expect(fallback.priceMultiplier).toBe(1);
        expect(fallback.paidOnly).not.toBe(true);
        const billing = calculateUsageBilling({
            model: "openai/gpt-6-astra",
            usage: { promptTextTokens: 11, completionTextTokens: 5 },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.000396, 12);
        expect(billing.price.totalPrice).toBe(0.00036);
        const model = findModelByName("openai/gpt-6-astra:azure:datazone");
        expect(model?.useResponsesApi).toBe(true);
        expect(model?.config()).toMatchObject({
            "azure-deployment-id": "gpt-6-astra-datazone",
            "azure-resource-name": "myceli-prod-eastus",
            responsesEndpoint:
                "https://myceli-prod-eastus.openai.azure.com/openai/v1/responses",
        });
    });

    it.each([
        "openai/gpt-6-luna",
        "openai/gpt-6.1-sol",
        "openai/gpt-6-sol",
    ] as const)(
        "keeps the same price and Quest access when %s falls back to OpenAI",
        (model) => {
            const primary = TEXT_SERVICES[model];
            const fallback = TEXT_SERVICES[`${model}:openai`];
            expect(primary.provider).toBe("azure");
            expect(primary.fallbacks).toEqual([`${model}:openai`]);
            expect(primary.paidOnly).toBe(false);
            expect(fallback.provider).toBe("openai");
            expect(fallback.paidOnly).toBe(false);
            expect(fallback.cost).toEqual(primary.cost);
            expect(fallback.costVariants).toEqual(primary.costVariants);
            expect(fallback.priceMultiplier).toBe(1);
            expect(findModelByName(`${model}:openai`)?.config()).toMatchObject({
                responsesEndpoint: "https://api.openai.com/v1/responses",
            });
        },
    );

    it("uses cheaper Replicate for Grok Video Pro with independent Fal backup", () => {
        const primary = IMAGE_SERVICES["x-ai/grok-imagine-video"];
        const fallback = IMAGE_SERVICES["x-ai/grok-imagine-video:fal"];
        expect(primary).toMatchObject({
            provider: "replicate",
            paidOnly: true,
            priceMultiplier: 1,
            aliases: ["grok-imagine-video", "grok-video-pro"],
            fallbacks: ["x-ai/grok-imagine-video:fal"],
            cost: { promptImageTokens: 0, completionVideoSeconds: 0.05 },
        });
        expect(fallback.provider).toBe("fal");
        expect(fallback.cost).toEqual({
            promptImageTokens: 0.002,
            completionVideoSeconds: 0.07,
        });
        expect(IMAGE_SERVICES).not.toHaveProperty(
            "x-ai/grok-imagine-video:openrouter",
        );
        expect(IMAGE_SERVICES["x-ai/grok-imagine-video-1.5"]).toMatchObject({
            provider: "xai",
            fallbacks: ["x-ai/grok-imagine-video-1.5:fal"],
        });
        const lite = IMAGE_SERVICES["x-ai/grok-imagine-video-1.5-lite"];
        const liteFallback =
            IMAGE_SERVICES["x-ai/grok-imagine-video-1.5-lite:openrouter"];
        expect(lite).toMatchObject({
            provider: "xai",
            aliases: [],
            fallbacks: ["x-ai/grok-imagine-video-1.5-lite:openrouter"],
        });
        expect(liteFallback.provider).toBe("openrouter");
        expect(liteFallback.cost).toEqual({
            promptImageTokens: 0.01 * 1.055,
            completionVideoSeconds: 0.03 * 1.055,
        });
    });

    it("keeps anthropic/claude-haiku-5.5's public quote when its backup multiplier is 1", () => {
        const model = "anthropic/claude-haiku-5.5";
        const primary = TEXT_SERVICES[model];
        const fallback = TEXT_SERVICES["anthropic/claude-haiku-5.5:aws"];
        const billed = calculateUsageBilling({
            model,
            usage: {
                promptTextTokens: 100,
                promptCachedTokens: 20,
                promptCacheWriteTokens: 10,
                completionTextTokens: 30,
            },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(fallback.priceMultiplier).toBe(1);
        expect(primary.priceMultiplier).toBe(0.75);
        expect(billed.cost.totalCost).toBeCloseTo(2.645e-5, 12);
        expect(billed.price.totalPrice).toBe(1.984e-5);
    });

    it("keeps same-provider routes distinct and ordered under a suffixed public ID", () => {
        const parentId = "google/gemini-2.5-flash-lite:search";
        const parent: ModelDefinition = {
            ...TEXT_SERVICES[parentId],
            // Isolate the synthetic pair from this model's live fallback list.
            fallbacks: undefined,
        };
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

    it("keeps anthropic/claude-sonnet-5.5's public quote when its backup multiplier is 1", () => {
        const model = "anthropic/claude-sonnet-5.5";
        const primary = TEXT_SERVICES[model];
        const fallback = TEXT_SERVICES["anthropic/claude-sonnet-5.5:aws"];
        const billed = calculateUsageBilling({
            model,
            usage: {
                promptTextTokens: 100,
                promptCachedTokens: 20,
                promptCacheWriteTokens: 10,
                completionTextTokens: 30,
            },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(fallback.priceMultiplier).toBe(1);
        expect(primary.priceMultiplier).toBe(0.75);
        expect(billed.cost.totalCost).toBeCloseTo(0.000527, 12);
        expect(billed.price.totalPrice).toBe(0.00039525);
    });

    it("keeps D1 paid-only and charges its public quote on OpenRouter fallback", () => {
        const primary = TEXT_SERVICES["liquid/d1"];
        const fallback = TEXT_SERVICES["liquid/d1:openrouter"];
        expect(primary.fallbacks).toEqual(["liquid/d1:openrouter"]);
        expect(fallback).toMatchObject({
            provider: "openrouter",
            paidOnly: true,
            hidden: true,
            fallbackOnly: true,
            aliases: [],
        });
        expect(findModelByName("liquid/d1:openrouter")?.config()).toMatchObject(
            {
                model: "liquid/d1",
                provider: "openrouter",
                directEndpoint: "https://openrouter.ai/api/alpha/decisions",
            },
        );
        const billing = calculateUsageBilling({
            model: "liquid/d1",
            usage: {
                promptTextTokens: 600,
                promptCachedTokens: 400,
                completionTextTokens: 0,
            },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.0000211, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.00002, 12);
    });

    it("charges Decider's Vercel price on its OpenRouter fallback", () => {
        const primary = TEXT_SERVICES["perplexity/pplx-decider-v1.2"];
        const fallback =
            TEXT_SERVICES["perplexity/pplx-decider-v1.2:openrouter"];
        expect(primary.fallbacks).toEqual([
            "perplexity/pplx-decider-v1.2:openrouter",
        ]);
        expect(fallback).toMatchObject({
            provider: "openrouter",
            paidOnly: true,
            hidden: true,
            fallbackOnly: true,
            aliases: [],
        });
        expect(
            findModelByName("perplexity/pplx-decider-v1.2")?.config(),
        ).toMatchObject({
            model: "perplexity/pplx-decider-v1.2",
            directEndpoint:
                "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
        });
        expect(
            findModelByName(
                "perplexity/pplx-decider-v1.2:openrouter",
            )?.config(),
        ).toMatchObject({
            model: "perplexity/pplx-decider-v1.2",
            provider: "openrouter",
            directEndpoint: "https://openrouter.ai/api/alpha/decisions",
        });
        const billing = calculateUsageBilling({
            model: "perplexity/pplx-decider-v1.2",
            usage: { promptTextTokens: 1000, completionTextTokens: 0 },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.0000211, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.00002, 12);
    });

    it("charges Microsoft Decision-1's Azure rate on its Vercel and OpenRouter fallbacks", () => {
        const primary = TEXT_SERVICES["microsoft/microsoft-decision-1"];
        const fallback =
            TEXT_SERVICES["microsoft/microsoft-decision-1:openrouter"];
        expect(primary.fallbacks).toEqual([
            "microsoft/microsoft-decision-1:vercel",
            "microsoft/microsoft-decision-1:openrouter",
        ]);
        expect(fallback).toMatchObject({
            provider: "openrouter",
            paidOnly: false,
            hidden: true,
            fallbackOnly: true,
            aliases: [],
        });
        expect(
            findModelByName("microsoft/microsoft-decision-1")?.config(),
        ).toMatchObject({
            model: "decision-1",
            directEndpoint:
                "https://myceli-prod-eastus.cognitiveservices.azure.com/providers/microsoft/v1/systemone",
            directAuthHeader: "api-key",
        });
        expect(
            findModelByName("microsoft/microsoft-decision-1:vercel")?.config(),
        ).toMatchObject({
            model: "microsoft/microsoft-decision-1",
            directEndpoint:
                "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
        });
        expect(
            findModelByName(
                "microsoft/microsoft-decision-1:openrouter",
            )?.config(),
        ).toMatchObject({
            model: "microsoft/microsoft-decision-1",
            provider: "openrouter",
            directEndpoint: "https://openrouter.ai/api/alpha/decisions",
        });
        const billing = calculateUsageBilling({
            model: "microsoft/microsoft-decision-1",
            usage: { promptTextTokens: 1000, completionTextTokens: 0 },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.00004431, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.0000315, 12);
    });

    it("quotes OpenAI's context tiers while accounting for OpenRouter's flat fallback cost", () => {
        const primary = TEXT_SERVICES["openai/gpt-6-luna-decisions"];
        const fallback =
            TEXT_SERVICES["openai/gpt-6-luna-decisions:openrouter"];
        expect(primary).toMatchObject({
            provider: "openai",
            paidOnly: true,
            aliases: [],
            fallbacks: ["openai/gpt-6-luna-decisions:openrouter"],
        });
        expect(fallback).toMatchObject({
            provider: "openrouter",
            paidOnly: true,
            hidden: true,
            fallbackOnly: true,
            aliases: [],
        });
        expect(
            findModelByName("openai/gpt-6-luna-decisions")?.config(),
        ).toMatchObject({
            model: "gpt-6-luna",
            directEndpoint: "https://api.openai.com/v1/decisions",
            decisionsProtocol: "openai",
        });
        expect(
            findModelByName("openai/gpt-6-luna-decisions:openrouter")?.config(),
        ).toMatchObject({
            model: "openai/gpt-6-luna-decisions",
            directEndpoint: "https://openrouter.ai/api/alpha/decisions",
        });
        for (const promptTextTokens of [
            1000, 272_000, 272_001, 900_000, 900_001,
        ]) {
            const usage = { promptTextTokens, completionTextTokens: 0 };
            const quote =
                (promptTextTokens * (promptTextTokens > 272_000 ? 0.2 : 0.1)) /
                1_000_000;
            const direct = calculateUsageBilling({
                model: "openai/gpt-6-luna-decisions",
                usage,
                servedBy: primary,
                quotedBy: primary,
            });
            const viaOpenRouter = calculateUsageBilling({
                model: "openai/gpt-6-luna-decisions",
                usage,
                servedBy: fallback,
                quotedBy: primary,
            });
            expect(direct.cost.totalCost).toBeCloseTo(quote, 12);
            expect(direct.price.totalPrice).toBeCloseTo(quote, 8);
            expect(viaOpenRouter.cost.totalCost).toBeCloseTo(
                (promptTextTokens * 0.1055) / 1_000_000,
                12,
            );
            expect(viaOpenRouter.price.totalPrice).toBeCloseTo(quote, 8);
        }
    });

    it("prices Claude Haiku 5.5 on AWS exactly as on Anthropic, including the long-context tier", () => {
        const primary = TEXT_SERVICES["anthropic/claude-haiku-5.5"];
        const fallback = TEXT_SERVICES["anthropic/claude-haiku-5.5:aws"];
        expect(primary).toMatchObject({
            provider: "anthropic",
            paidOnly: true,
            aliases: [],
            fallbacks: ["anthropic/claude-haiku-5.5:aws"],
        });
        expect(fallback).toMatchObject({
            provider: "aws",
            paidOnly: true,
            hidden: true,
            fallbackOnly: true,
            aliases: [],
        });
        for (const [promptTextTokens, expected] of [
            [1000, (1000 * 0.1 + 1000 * 0.5) / 1e6],
            [100_001, (100_001 * 0.5 + 1000 * 2.5) / 1e6],
        ] as const) {
            const billing = calculateUsageBilling({
                model: "anthropic/claude-haiku-5.5",
                usage: { promptTextTokens, completionTextTokens: 1000 },
                servedBy: fallback,
                quotedBy: primary,
            });
            expect(billing.cost.totalCost).toBeCloseTo(expected, 9);
        }
    });

    it("keeps Jev's lower Vercel quote when OpenRouter serves it", () => {
        const model = "typesafe/jev-1.13";
        expect(TEXT_SERVICES[model].fallbacks).toEqual([
            `${model}:openrouter:typesafe`,
        ]);
        const billed = calculateUsageBilling({
            model,
            usage: { promptTextTokens: 10000, completionTextTokens: 100 },
            servedBy: TEXT_SERVICES[`${model}:openrouter:typesafe`],
            quotedBy: TEXT_SERVICES[model],
        });
        expect(billed.cost.totalCost).toBeCloseTo(0.0004431, 12);
        expect(billed.price.totalPrice).toBe(0.00042);
    });

    it("prices Muse Wonder on Vercel at base rates and quotes the OpenRouter primary with its fee", () => {
        const primary = TEXT_SERVICES["meta/muse-wonder-1.0"];
        const fallback = TEXT_SERVICES["meta/muse-wonder-1.0:vercel"];
        expect(primary).toMatchObject({
            provider: "openrouter",
            paidOnly: true,
            aliases: [],
            fallbacks: ["meta/muse-wonder-1.0:vercel"],
        });
        expect(fallback).toMatchObject({
            provider: "vercel",
            paidOnly: true,
            hidden: true,
            fallbackOnly: true,
            aliases: [],
            tools: true,
        });
        expect(findModelByName("meta/muse-wonder-1.0")?.config()).toMatchObject(
            { provider: "openrouter", model: "meta/muse-wonder" },
        );
        expect(
            findModelByName("meta/muse-wonder-1.0:vercel")?.config(),
        ).toMatchObject({ model: "meta/muse-wonder-1.0" });
        const billing = calculateUsageBilling({
            model: "meta/muse-wonder-1.0",
            usage: { promptTextTokens: 1000, completionTextTokens: 1000 },
            servedBy: fallback,
            quotedBy: primary,
        });
        // Vercel base rates ($4 in, $20 out per 1M) set the cost; the
        // OpenRouter quote ($4.22 in, $21.10 out) sets the price.
        expect(billing.cost.totalCost).toBeCloseTo(0.024, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.02532, 12);
        expect(
            supportsTextFallbackRequest(fallback, {
                messages: [{ role: "user", content: "hi" }],
                tools: [{ type: "function", function: { name: "lookup" } }],
            }),
        ).toBe(true);
    });

    it("prices Step 5 Preview on Vercel at base rates and supports tool calls on that fallback", () => {
        const primary = TEXT_SERVICES["stepfun/step-5-preview"];
        const fallback = TEXT_SERVICES["stepfun/step-5-preview:vercel"];
        expect(primary).toMatchObject({
            provider: "openrouter",
            paidOnly: true,
            aliases: [],
            fallbacks: ["stepfun/step-5-preview:vercel"],
        });
        expect(fallback).toMatchObject({
            provider: "vercel",
            paidOnly: true,
            hidden: true,
            fallbackOnly: true,
            aliases: [],
            tools: true,
        });
        expect(
            findModelByName("stepfun/step-5-preview")?.config(),
        ).toMatchObject({
            provider: "openrouter",
            model: "stepfun/step-5-preview",
        });
        expect(
            findModelByName("stepfun/step-5-preview:vercel")?.config(),
        ).toMatchObject({ model: "stepfun/step-5-preview" });
        const billing = calculateUsageBilling({
            model: "stepfun/step-5-preview",
            usage: { promptTextTokens: 1000, completionTextTokens: 1000 },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.0037, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.0039035, 12);
        expect(
            supportsTextFallbackRequest(fallback, {
                messages: [{ role: "user", content: "hi" }],
                tools: [{ type: "function", function: { name: "lookup" } }],
            }),
        ).toBe(true);
        expect(
            supportsTextFallbackRequest(fallback, {
                messages: [
                    {
                        role: "assistant",
                        tool_calls: [
                            {
                                id: "call_1",
                                type: "function",
                                function: { name: "lookup", arguments: "{}" },
                            },
                        ],
                    },
                    { role: "tool", tool_call_id: "call_1", content: "found" },
                ],
            }),
        ).toBe(true);
        expect(
            supportsTextFallbackRequest(fallback, {
                messages: [{ role: "user", content: "hi" }],
            }),
        ).toBe(true);
    });

    it("falls back from Step 3.7 Flash on Novita to StepFun on Vercel at the same rates", () => {
        const primary = TEXT_SERVICES["stepfun/step-3.7-flash"];
        const fallback = TEXT_SERVICES["stepfun/step-3.7-flash:vercel"];
        expect(primary).toMatchObject({
            provider: "novita",
            fallbacks: ["stepfun/step-3.7-flash:vercel"],
        });
        expect(fallback).toMatchObject({
            provider: "vercel",
            hidden: true,
            fallbackOnly: true,
        });
        expect(
            findModelByName("stepfun/step-3.7-flash:vercel")?.config(),
        ).toMatchObject({
            model: "stepfun/step-3.7-flash",
            responsesEndpoint: undefined,
            defaultOptions: {
                providerOptions: { gateway: { only: ["stepfun"] } },
            },
        });
        const usage = {
            promptTextTokens: 1000,
            promptCachedTokens: 1000,
            completionTextTokens: 1000,
        };
        const served = calculateUsageBilling({
            model: "stepfun/step-3.7-flash",
            usage,
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(served.cost.totalCost).toBeCloseTo(0.00139, 12);
        expect(served.price.totalPrice).toBeCloseTo(0.00139, 12);
        expect(
            supportsTextFallbackRequest(fallback, {
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image_url",
                                image_url: { url: "https://example.com/a.png" },
                            },
                        ],
                    },
                ],
                tools: [{ type: "function", function: { name: "lookup" } }],
            }),
        ).toBe(true);
    });

    it.each([
        ["deepseek/deepseek-v4.1-flash", 0.000546],
        ["deepseek/deepseek-v4.1-flash:fireworks", 0.000546],
    ] as const)(
        "bills DeepSeek V4.1 Flash at the Azure quote when %s serves",
        (route, cost) => {
            const billing = calculateUsageBilling({
                model: "deepseek/deepseek-v4.1-flash",
                servedBy: TEXT_SERVICES[route],
                quotedBy: TEXT_SERVICES["deepseek/deepseek-v4.1-flash"],
                usage: {
                    promptTextTokens: 1000,
                    promptCachedTokens: 1000,
                    completionTextTokens: 100,
                    completionReasoningTokens: 100,
                },
            });
            expect(billing.cost.totalCost).toBeCloseTo(cost, 12);
            expect(billing.price.totalPrice).toBeCloseTo(0.000273, 8);
        },
    );

    it("records DeepSeek Flash 1017's discounted fallback cost at the unchanged primary quote", () => {
        const model = "deepseek/deepseek-v4.1-flash-1017";
        const billing = calculateUsageBilling({
            model,
            servedBy: TEXT_SERVICES[`${model}:deepinfra`],
            quotedBy: TEXT_SERVICES[model],
            usage: {
                promptTextTokens: 1000,
                promptCachedTokens: 1000,
                completionTextTokens: 100,
                completionReasoningTokens: 100,
            },
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.00015974, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.000273, 8);
    });

    it("updates StreamLake's DeepSeek Pro cost without changing the caller's quote", () => {
        const billing = calculateUsageBilling({
            model: "deepseek/deepseek-v4-pro",
            servedBy:
                TEXT_SERVICES["deepseek/deepseek-v4-pro:openrouter:streamlake"],
            quotedBy: TEXT_SERVICES["deepseek/deepseek-v4-pro"],
            usage: {
                promptTextTokens: 1000,
                promptCachedTokens: 1000,
                completionTextTokens: 100,
                completionReasoningTokens: 100,
            },
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.00113729, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.00201231, 8);
    });

    it("keeps the Kimi K3 quote when DeepInfra serves cached and reasoning tokens", () => {
        const primary = TEXT_SERVICES["moonshotai/kimi-k3"];
        const fallback = TEXT_SERVICES["moonshotai/kimi-k3:deepinfra"];
        const billing = calculateUsageBilling({
            model: "moonshotai/kimi-k3",
            usage: {
                promptTextTokens: 1000,
                promptCachedTokens: 1000,
                completionTextTokens: 100,
                completionReasoningTokens: 100,
            },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.005985, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.0063, 8);
        expect(
            findModelByName("moonshotai/kimi-k3:deepinfra")?.config(),
        ).toMatchObject({
            "custom-host": "https://api.deepinfra.com/v1/openai",
            model: "moonshotai/Kimi-K3",
        });
    });

    it("keeps the MiniMax M3 quote when DeepInfra serves cached and reasoning tokens", () => {
        const primary = TEXT_SERVICES["minimax/minimax-m3"];
        const fallback = TEXT_SERVICES["minimax/minimax-m3:deepinfra"];
        const billing = calculateUsageBilling({
            model: "minimax/minimax-m3",
            usage: {
                promptTextTokens: 1000,
                promptCachedTokens: 1000,
                completionTextTokens: 100,
                completionReasoningTokens: 100,
            },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.000556, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.0006, 8);
        expect(
            findModelByName("minimax/minimax-m3:deepinfra")?.config(),
        ).toMatchObject({
            "custom-host": "https://api.deepinfra.com/v1/openai",
            model: "MiniMaxAI/MiniMax-M3",
        });
    });

    it.each([
        [{ usage: { payg_credits_charged: 0.0001 } }, 0.0001],
        [{ usage: { payg_credits_charged: 0 } }, 0],
        [
            {
                streamEvents: [
                    { usage: { payg_credits_charged: 0.00005 } },
                    { payg_usage: { payg_credits_charged: 0.0001 } },
                    { payg_credits_charged: 0.0001 },
                ],
            },
            0.0001,
        ],
        [{}, 0.001365],
        [{ usage: { payg_credits_charged: -1 } }, 0.001365],
        [{ usage: { payg_credits_charged: "0.0001" } }, 0.001365],
        [{ usage: { payg_credits_charged: Number.NaN } }, 0.001365],
        [
            { usage: { payg_credits_charged: Number.POSITIVE_INFINITY } },
            0.001365,
        ],
    ])(
        "settles Lightning v2.1 from a valid final receipt: %j",
        (output, expected) => {
            const model = "inferenceport-ai/lightning-text-v2.1";
            const billed = calculateUsageBilling({
                model,
                output,
                usage: { promptTextTokens: 1819, completionTextTokens: 1 },
                servedBy: TEXT_SERVICES[model],
            });
            expect(billed.cost.totalCost).toBeCloseTo(expected, 12);
            expect(billed.price.totalPrice).toBe(expected);
        },
    );

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

    it("records MiMo V2.6 Pro's discounted backup cost and keeps the Novita quote", () => {
        const model = "xiaomi/mimo-v2.6-pro";
        const billed = calculateUsageBilling({
            model,
            usage: {
                promptTextTokens: 1000,
                promptCachedTokens: 200,
                completionTextTokens: 100,
            },
            servedBy: TEXT_SERVICES[`${model}:deepinfra`],
            quotedBy: TEXT_SERVICES[model],
        });
        expect(billed.cost.totalCost).toBeCloseTo(0.000465948, 12);
        expect(billed.price.totalPrice).toBe(0.00052272);
    });

    it("charges SiliconFlow's reported cache hits at its full input rate", () => {
        const model = "qwen/qwen3-coder-30b-a3b-instruct";
        const billed = calculateUsageBilling({
            model,
            usage: {
                promptTextTokens: 252,
                promptCachedTokens: 32,
                completionTextTokens: 6,
            },
            servedBy: TEXT_SERVICES[model],
            quotedBy: TEXT_SERVICES[model],
        });
        expect(billed.cost.totalCost).toBeCloseTo(0.00002156 * 1.055, 12);
        expect(billed.price.totalPrice).toBe(0.00002275);
    });

    it("keeps the cheaper coder quote when Bedrock serves it", () => {
        const model = "qwen/qwen3-coder-30b-a3b-instruct";
        const billed = calculateUsageBilling({
            model,
            usage: { promptTextTokens: 1000, completionTextTokens: 100 },
            servedBy: TEXT_SERVICES[`${model}:aws`],
            quotedBy: TEXT_SERVICES[model],
        });
        expect(billed.cost.totalCost).toBeCloseTo(0.00021, 12);
        expect(billed.price.totalPrice).toBeCloseTo(0.00010339, 12);
    });

    it("keeps exact provider route costs", () => {
        expect(TEXT_SERVICES["openai/gpt-4o-mini"].cost).toMatchObject({
            promptTextTokens: 0.15 / 1_000_000,
            promptCachedTokens: 0.075 / 1_000_000,
            completionTextTokens: 0.6 / 1_000_000,
        });
        expect(TEXT_SERVICES["openai/gpt-4o-mini"].fallbacks).toEqual([
            "openai/gpt-4o-mini:openrouter:openai",
        ]);
        expect(
            TEXT_SERVICES["openai/gpt-4o-mini:openrouter:openai"].cost,
        ).toMatchObject({
            promptTextTokens: (0.15 / 1_000_000) * 1.055,
            promptCachedTokens: (0.075 / 1_000_000) * 1.055,
            completionTextTokens: (0.6 / 1_000_000) * 1.055,
        });
        expect(TEXT_SERVICES["x-ai/grok-4.6"].fallbacks).toEqual([
            "x-ai/grok-4.6:xai",
        ]);
        expect(TEXT_SERVICES["x-ai/grok-4.6:xai"].priceMultiplier).toBe(1);

        expect(
            TEXT_SERVICES["deepseek/deepseek-v4-flash:deepinfra"].cost,
        ).toMatchObject({
            promptTextTokens: 0.06 / 1_000_000,
            promptCachedTokens: 0.015 / 1_000_000,
            completionTextTokens: 0.18 / 1_000_000,
        });
        expect(TEXT_SERVICES["qwen/qwen3.8-27b"].cost).toMatchObject({
            promptTextTokens: (0.039 / 1_000_000) * 1.055,
            promptCachedTokens: (0.0039 / 1_000_000) * 1.055,
            promptImageTokens: (0.039 / 1_000_000) * 1.055,
            promptVideoTokens: (0.039 / 1_000_000) * 1.055,
            completionTextTokens: (1.25 / 1_000_000) * 1.055,
        });
        expect(
            TEXT_SERVICES["qwen/qwen3.8-27b:openrouter:reka-fp8"].cost,
        ).toMatchObject({
            promptTextTokens: (0.04 / 1_000_000) * 1.055,
            promptCachedTokens: (0.02 / 1_000_000) * 1.055,
            promptImageTokens: (0.04 / 1_000_000) * 1.055,
            promptVideoTokens: (0.04 / 1_000_000) * 1.055,
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
            TEXT_SERVICES["nvidia/nemotron-3.5-super-vl"].cost,
        ).toMatchObject({
            promptTextTokens: 0.15 / 1_000_000,
            promptCachedTokens: 0.02 / 1_000_000,
            completionTextTokens: 0.5 / 1_000_000,
        });
        expect(
            TEXT_SERVICES["nvidia/nemotron-3.5-super-vl:openrouter:together"]
                .cost,
        ).toMatchObject({
            promptTextTokens: (0.15 / 1_000_000) * 1.055,
            promptCachedTokens: (0.02 / 1_000_000) * 1.055,
            completionTextTokens: (0.5 / 1_000_000) * 1.055,
        });
        expect(
            TEXT_SERVICES["meta/llama-4-scout:openrouter:novita-bf16"].cost,
        ).toMatchObject({
            promptTextTokens: (0.18 / 1_000_000) * 1.055,
            promptImageTokens: (0.18 / 1_000_000) * 1.055,
            completionTextTokens: (0.59 / 1_000_000) * 1.055,
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

    it("keeps the Vertex quote while recording Gemini 4 Argon backup promotional costs", () => {
        const primary = TEXT_SERVICES["google/gemini-4-argon"];
        const fallback =
            TEXT_SERVICES["google/gemini-4-argon:openrouter:ai-studio"];
        expect(primary).toMatchObject({
            provider: "google",
            paidOnly: true,
            priceMultiplier: 1,
            aliases: [],
            fallbacks: ["google/gemini-4-argon:openrouter:ai-studio"],
        });
        expect(fallback.cost).toMatchObject({
            promptTextTokens: (2 / 1_000_000) * 1.055,
            promptCachedTokens: (0.1 / 1_000_000) * 1.055,
            completionTextTokens: (10 / 1_000_000) * 1.055,
        });
        const billing = calculateUsageBilling({
            model: "google/gemini-4-argon",
            usage: { promptTextTokens: 1000, completionTextTokens: 1000 },
            servedBy: fallback,
            quotedBy: primary,
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.01266, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.024, 12);
        const cacheWrite = calculateUsageBilling({
            model: "google/gemini-4-argon",
            usage: { promptCacheWriteTokens: 1000 },
            servedBy: fallback,
            quotedBy: primary,
            output: {
                usage: { prompt_tokens_details: { cache_write_tokens: 1000 } },
            },
        });
        expect(cacheWrite.cost.totalCost).toBeCloseTo(
            (0.002 + 0.0001875) * 1.055,
            12,
        );
        expect(cacheWrite.price.totalPrice).toBeCloseTo(0.004, 12);
        expect(
            findModelByName(
                "google/gemini-4-argon:openrouter:ai-studio",
            )?.config(),
        ).toMatchObject({
            defaultOptions: {
                provider: {
                    ignore: [
                        "google-ai-studio/priority",
                        "google-ai-studio/flex",
                    ],
                },
            },
        });
    });

    it.each([
        "meta/llama-4-scout:openrouter:deepinfra-fp8-priority",
        "meta/llama-4-scout:openrouter:novita-bf16",
    ] as const)("preserves Scout capabilities through %s", (fallback) => {
        const primary = TEXT_SERVICES["meta/llama-4-scout"];
        const route = TEXT_SERVICES[fallback];
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
    ])(
        "rejects unsupported Scout capabilities on both routes: %j",
        (request) => {
            const before = JSON.stringify(request);
            expect(
                textCapabilityError(
                    TEXT_SERVICES["meta/llama-4-scout"],
                    request,
                ),
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
        },
    );

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
    ])(
        "allows defaults and large payloads through Novita (case %#)",
        (request) => {
            expect(
                supportsTextFallbackRequest(
                    TEXT_SERVICES["meta/llama-4-scout:openrouter:novita-bf16"],
                    request,
                ),
            ).toBe(true);
        },
    );

    it("rejects JSON mode on Sonar before generation but keeps JSON schema", () => {
        const sonar = TEXT_SERVICES["perplexity/sonar"];
        for (const request of [
            { response_format: { type: "json_object" } },
            { text: { format: { type: "json_object" } } },
        ]) {
            expect(textCapabilityError(sonar, request)).toMatch(
                /does not support JSON mode/,
            );
        }
        for (const request of [
            {
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "answer",
                        schema: {
                            type: "object",
                            properties: { capital: { type: "string" } },
                        },
                    },
                },
            },
            { response_format: { type: "text" } },
            {},
        ]) {
            expect(textCapabilityError(sonar, request)).toBeUndefined();
        }
    });

    it.each([
        [{ usage: { payg_credits_charged: 0.0001 } }, 0.0001],
        [{ usage: { payg_credits_charged: 0 } }, 0],
        [
            {
                streamEvents: [
                    { usage: { payg_credits_charged: 0.00005 } },
                    { payg_usage: { payg_credits_charged: 0.0001 } },
                    { payg_credits_charged: 0.0001 },
                ],
            },
            0.0001,
        ],
        [{}, 0.001365],
        [{ usage: { payg_credits_charged: -1 } }, 0.001365],
        [{ usage: { payg_credits_charged: "0.0001" } }, 0.001365],
        [{ usage: { payg_credits_charged: Number.NaN } }, 0.001365],
        [
            { usage: { payg_credits_charged: Number.POSITIVE_INFINITY } },
            0.001365,
        ],
    ])(
        "settles Lightning v2 from a valid final receipt: %j",
        (output, expected) => {
            const model = "inferenceport-ai/lightning-text-v2";
            const billed = calculateUsageBilling({
                model,
                output,
                usage: { promptTextTokens: 1819, completionTextTokens: 1 },
                servedBy: TEXT_SERVICES[model],
            });
            expect(billed.cost.totalCost).toBeCloseTo(expected, 12);
            expect(billed.price.totalPrice).toBe(expected);
        },
    );

    it("rejects image input only for models without image input", () => {
        const chat = {
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What color is this?" },
                        {
                            type: "image_url",
                            image_url: { url: "https://example.com/a.png" },
                        },
                    ],
                },
            ],
        };
        const responses = {
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_image",
                            image_url: "https://example.com/a.png",
                        },
                    ],
                },
            ],
        };
        for (const request of [chat, responses]) {
            expect(
                textCapabilityError(
                    TEXT_SERVICES["openai/gpt-oss-20b"],
                    request,
                ),
            ).toBe("This model does not support image input");
            expect(
                textCapabilityError(
                    TEXT_SERVICES["openai/gpt-5.4-nano"],
                    request,
                ),
            ).toBeUndefined();
        }
        expect(
            textCapabilityError(TEXT_SERVICES["openai/gpt-oss-20b"], {
                messages: [{ role: "user", content: "Hello" }],
            }),
        ).toBeUndefined();
    });

    it("rejects PDF file parts only for models without image input", () => {
        const pdf = "data:application/pdf;base64,JVBERi0x";
        const chat = {
            messages: [
                {
                    role: "user",
                    content: [{ type: "file", file: { file_data: pdf } }],
                },
            ],
        };
        const responses = {
            input: [
                {
                    role: "user",
                    content: [{ type: "input_file", file_data: pdf }],
                },
            ],
        };
        for (const request of [chat, responses]) {
            expect(
                textCapabilityError(
                    TEXT_SERVICES["openai/gpt-oss-20b"],
                    request,
                ),
            ).toBe(
                "This model does not support PDF or file input; choose a model with image input",
            );
            const definitions: Record<string, ModelDefinition> = TEXT_SERVICES;
            const openRouterTextModel = Object.keys(definitions).find(
                (name) =>
                    definitions[name].provider === "openrouter" &&
                    !definitions[name].inputModalities?.includes("image"),
            );
            for (const model of [
                "openai/gpt-5.4-nano",
                "anthropic/claude-sonnet-4.6",
                // OpenRouter parses PDFs to text for any model.
                openRouterTextModel ?? "",
            ]) {
                expect(definitions[model]).toBeDefined();
                expect(
                    textCapabilityError(definitions[model], request),
                ).toBeUndefined();
            }
        }
    });

    it("keeps Qwen VL's direct quote when OpenRouter serves it", () => {
        const model = "qwen/qwen3-vl-30b-a3b-instruct";
        const billed = calculateUsageBilling({
            model,
            usage: { promptTextTokens: 226, completionTextTokens: 7 },
            servedBy: TEXT_SERVICES[`${model}:openrouter:deepinfra`],
            quotedBy: TEXT_SERVICES[model],
        });
        expect(billed.cost.totalCost).toBeCloseTo(0.0000381 * 1.055, 12);
        expect(billed.price.totalPrice).toBe(0.0000381);
    });

    it("falls back from direct Novita to Novita through Vercel at the same cost", () => {
        const primary = "inclusionai/ling-3.1-flash";
        const route = `${primary}:vercel:novita`;
        expect(TEXT_SERVICES[primary].fallbacks).toEqual([route]);
        expect(TEXT_SERVICES[route]).toMatchObject({
            provider: "vercel",
            hidden: true,
            fallbackOnly: true,
            aliases: [],
            cost: TEXT_SERVICES[primary].cost,
        });
        expect(findModelByName(route)?.config()).toMatchObject({
            model: primary,
            directEndpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
            defaultOptions: {
                providerOptions: { gateway: { only: ["novita"] } },
            },
        });
        expect(getVisibleTextModels()).not.toContain(route);
        const billed = calculateUsageBilling({
            model: primary,
            usage: { promptTextTokens: 1000, completionTextTokens: 100 },
            servedBy: TEXT_SERVICES[route],
            quotedBy: TEXT_SERVICES[primary],
        });
        const { promptTextTokens, completionTextTokens } =
            TEXT_SERVICES[primary].cost;
        const quoted = 1000 * promptTextTokens + 100 * completionTextTokens;
        expect(billed.cost.totalCost).toBeCloseTo(quoted, 12);
        expect(billed.price.totalPrice).toBeCloseTo(quoted, 12);
    });

    it("tries Scout priority before Novita in both API formats", () => {
        const primary = "meta/llama-4-scout";
        const priority = `${primary}:openrouter:deepinfra-fp8-priority`;
        const novita = `${primary}:openrouter:novita-bf16`;
        expect(TEXT_SERVICES[primary].fallbacks).toEqual([priority, novita]);
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
        expect(resolveDirectResponsesTarget(priority, request)).toMatchObject({
            endpoint: "https://openrouter.ai/api/v1/responses",
            defaults: {
                provider: {
                    only: ["deepinfra/fp8/priority"],
                    allow_fallbacks: false,
                },
            },
        });
        expect(resolveDirectResponsesTarget(novita, request)).toMatchObject({
            endpoint: "https://openrouter.ai/api/v1/responses",
            defaults: {
                provider: { only: ["novita/bf16"], allow_fallbacks: false },
            },
        });
    });

    it("binds fallback-only text ids to their exact provider routes", () => {
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
        expect(
            findModelByName("xiaomi/mimo-v2.6-flash:deepinfra")?.config(),
        ).toMatchObject({
            "custom-host": "https://api.deepinfra.com/v1/openai",
            model: "XiaomiMiMo/MiMo-V2.6-Flash",
        });
        expect(
            findModelByName("xiaomi/mimo-v2.6-pro:deepinfra")?.config(),
        ).toMatchObject({
            "custom-host": "https://api.deepinfra.com/v1/openai",
            model: "XiaomiMiMo/MiMo-V2.6-Pro",
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
        expect(
            findModelByName("mistralai/mistral-large-4")?.config(),
        ).toMatchObject({
            "custom-host": "https://api.mistral.ai/v1",
            model: "mistral-large-4",
        });
        expect(
            findModelByName("mistralai/mistral-large-4:vercel")?.config(),
        ).toMatchObject({
            provider: "openai",
            model: "mistral/mistral-large-4",
            defaultOptions: {
                providerOptions: { gateway: { only: ["mistral"] } },
            },
        });
        for (const [unit, cost] of Object.entries(
            TEXT_SERVICES["mistralai/mistral-large-4"].cost,
        )) {
            expect(
                TEXT_SERVICES["mistralai/mistral-large-4:vercel"].cost[
                    unit as keyof (typeof TEXT_SERVICES)["mistralai/mistral-large-4"]["cost"]
                ],
            ).toBeCloseTo(cost, 15);
        }
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

it.each([199999, 200000, 200001])(
    "records Grok 4.3 backup's inclusive long-context cost at %s tokens, retaining the primary quote",
    (total) => {
        const model = "x-ai/grok-4.3";
        const servedBy = TEXT_SERVICES[`${model}:openrouter:xai-zdr`];
        expect(servedBy.priceMultiplier).toBe(1);
        const usage = {
            promptTextTokens: total - 1000,
            promptImageTokens: 500,
            promptCachedTokens: 500,
            completionTextTokens: 10,
        };
        const billed = calculateUsageBilling({
            model,
            usage,
            servedBy,
            quotedBy: TEXT_SERVICES[model],
        });
        const base = ((total - 500) * 1.25 + 500 * 0.2 + 10 * 2.5) / 1e6;
        expect(billed.cost.totalCost).toBeCloseTo(
            base * 1.055 * (total >= 200000 ? 2 : 1),
            12,
        );
        expect(billed.price.totalPrice).toBeCloseTo(base * 0.75, 8);
    },
);

it.each([272000, 272001])(
    "prices Luna Decisions cache categories without double counting at %s input tokens",
    (total) => {
        const model = "openai/gpt-6-luna-decisions";
        const primary = TEXT_SERVICES[model];
        const fallback = TEXT_SERVICES[`${model}:openrouter`];
        const usage = {
            promptTextTokens: total - 3000,
            promptCachedTokens: 2000,
            promptCacheWriteTokens: 1000,
        };
        const expected =
            (((total - 3000) * 0.1 + 2000 * 0.01 + 1000 * 0.125) / 1e6) *
            (total > 272000 ? 2 : 1);
        for (const servedBy of [primary, fallback]) {
            const billed = calculateUsageBilling({
                model,
                usage,
                servedBy,
                quotedBy: primary,
            });
            expect(billed.price.totalPrice).toBeCloseTo(expected, 8);
            if (servedBy === fallback)
                expect(billed.cost.totalCost).toBeCloseTo(
                    ((total - 3000) * 0.1 * 1.055) / 1e6,
                    12,
                );
        }
    },
);

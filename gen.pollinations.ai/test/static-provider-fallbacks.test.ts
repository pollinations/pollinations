import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { AUDIO_FALLBACKS } from "@shared/registry/audio-fallbacks.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { IMAGE_FALLBACKS } from "@shared/registry/image-fallbacks.ts";
import { mergeFallbacks } from "@shared/registry/merge-fallbacks.ts";
import { MODEL3D_SERVICES } from "@shared/registry/model3d.ts";
import {
    calculateUsageBilling,
    getExecutionRouteId,
    getModels,
    getRegistryModelDefinition,
    getVisibleAudioModels,
    getVisibleImageModels,
    getVisibleTextModels,
    type ModelDefinition,
    type ModelName,
} from "@shared/registry/registry.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { TEXT_FALLBACKS } from "@shared/registry/text-fallbacks.ts";
import { describe, expect, it } from "vitest";
import { findModelByName } from "../src/text/availableModels.ts";
import { supportsTextFallbackRequest } from "../src/text/fallbackCompatibility.ts";

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
        "mistralai/mistral-large-3:openrouter:mistral-zdr",
        "mistralai/mistral-large-2512",
        "mistral/zdr",
    ],
    [
        "anthropic/claude-opus-4.7:openrouter:vertex-global",
        "anthropic/claude-opus-4.7",
        "google-vertex/global",
    ],
    [
        "meta/llama-4-scout:openrouter:vertex-us-east5",
        "meta-llama/llama-4-scout",
        "google-vertex/us-east5",
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
        "meta/muse-glimmer-30b:openrouter:deepinfra-bf16",
        "meta/muse-glimmer-30b",
        "deepinfra/bf16",
    ],
    [
        "nvidia/nemotron-3.5-lightning:openrouter:coreweave-bf16",
        "nvidia/nemotron-3.5-lightning",
        "coreweave/bf16",
    ],
    [
        "mistralai/mistral-small-4:openrouter:mistral-eu",
        "mistralai/mistral-small-2603",
        "mistral/eu",
    ],
    [
        "google/gemini-3.7-flash:openrouter:ai-studio-priority",
        "google/gemini-3.7-flash",
        "google-ai-studio/priority",
    ],
    [
        "google/gemini-2.5-flash-lite:openrouter:ai-studio",
        "google/gemini-2.5-flash-lite",
        "google-ai-studio",
    ],
    [
        "google/gemini-3.5-flash-lite:openrouter:ai-studio-flex",
        "google/gemini-3.5-flash-lite",
        "google-ai-studio/flex",
    ],
    [
        "google/gemini-3.1-pro-preview:openrouter:ai-studio",
        "google/gemini-3.1-pro-preview",
        "google-ai-studio",
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
        publicModelId: parentId,
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
    it("keeps OpenRouter route suffixes consistent with configured upstream pins", () => {
        for (const [id, definition] of Object.entries(TEXT_SERVICES)) {
            if (definition.provider !== "openrouter") continue;
            const config = findModelByName(id)?.config();
            const routing = (
                config?.defaultOptions as
                    | {
                          provider?: {
                              only?: string[];
                              allow_fallbacks?: boolean;
                          };
                      }
                    | undefined
            )?.provider;
            const suffix = getExecutionRouteId(id, definition).split(
                ":openrouter",
            )[1];
            if (routing?.only) {
                expect(routing.only, id).toHaveLength(1);
                expect(routing.allow_fallbacks, id).toBe(false);
                // Existing route IDs abbreviate Google's provider tags.
                const pin = routing.only[0]
                    .toLowerCase()
                    .replace(/^google-/, "")
                    .replaceAll("/", "-");
                expect(suffix, id).toBe(`:${pin}`);
            } else {
                expect(suffix, id).toBe("");
            }
        }
    });

    it("assigns a distinct execution identity to every bundled route", () => {
        const routes = new Set<string>();
        for (const id of getModels()) {
            const definition = getRegistryModelDefinition(id);
            const routeId = getExecutionRouteId(id, definition);
            expect(routes.has(routeId), `${id}: duplicate ${routeId}`).toBe(
                false,
            );
            routes.add(routeId);
            const publicId = definition.publicModelId ?? id;
            // Bedrock is the existing route label for the canonical AWS supplier.
            const providers =
                definition.provider === "aws"
                    ? ["aws", "bedrock"]
                    : [definition.provider];
            expect(
                providers.some((provider) => {
                    const prefix = `${publicId}:${provider}`;
                    return (
                        routeId === prefix || routeId.startsWith(`${prefix}:`)
                    );
                }),
                `${id}: route identity must match its serving model and provider`,
            ).toBe(true);
            if (definition.fallbackOnly) {
                expect(routeId).toBe(id);
                expect(
                    getRegistryModelDefinition(
                        definition.publicModelId as ModelName,
                    ),
                ).toBeDefined();
            }
        }
    });

    it("keeps the public ID and route identities when providers change priority", () => {
        const id = "x-ai/grok-imagine-video";
        const primary = IMAGE_SERVICES[id];
        const secondary = IMAGE_SERVICES["x-ai/grok-imagine-video:openrouter"];
        const primaryRoute = getExecutionRouteId(id, primary);
        const reordered = mergeFallbacks(
            { [id]: { ...secondary, fallbackOnly: false, hidden: false } },
            { [id]: { [primaryRoute]: { provider: primary.provider } } },
        );
        expect(getExecutionRouteId(id, reordered[id])).toBe(secondary.routeId);
        expect(reordered[primaryRoute].routeId).toBe(primaryRoute);
        expect(reordered[primaryRoute].publicModelId).toBe(id);
        const newProvider = { ...primary, provider: "new-provider" };
        expect(getExecutionRouteId(id, newProvider)).toBe(`${id}:new-provider`);
        expect(newProvider).not.toHaveProperty("routeId");
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
        expect(primary.paidOnly).not.toBe(true);
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
            expect(billed.cost.totalCost).toBeCloseTo(expected, 12);
            expect(billed.price.totalPrice).toBeCloseTo(expected, 12);
            expect(billed.adjustments).toHaveLength(1);
            expect(billed.adjustments[0]).toMatchObject({
                kind: "search_request",
                units: 1,
                cost: searchFee,
            });
        }
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
        expect(fallback.cost).toEqual(primary.cost);
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
            expect(services[routeId].routeId).toBe(routeId);
            expect(services[routeId].cost).toEqual(parent.cost);
        }
        expect(parent.fallbacks).toBeUndefined();
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

    it("keeps provider-specific fallback costs", () => {
        expect(TEXT_SERVICES["x-ai/grok-4.6"].fallbacks).toEqual([
            "x-ai/grok-4.6:azure:sweden",
        ]);
        expect(TEXT_SERVICES["x-ai/grok-4.6:azure:sweden"].cost).toEqual(
            TEXT_SERVICES["x-ai/grok-4.6"].cost,
        );
        expect(
            TEXT_SERVICES["deepseek/deepseek-v4-flash:deepinfra"].cost,
        ).toMatchObject({
            promptTextTokens: 0.08 / 1_000_000,
            completionTextTokens: 0.18 / 1_000_000,
        });
        expect(
            TEXT_SERVICES["meta/llama-4-scout:openrouter:vertex-us-east5"].cost,
        ).toMatchObject({
            promptTextTokens: 0.25 / 1_000_000,
            promptImageTokens: 0.25 / 1_000_000,
            completionTextTokens: 0.7 / 1_000_000,
        });
        expect(
            IMAGE_SERVICES["qwen/qwen-image-3:replicate"].cost,
        ).toMatchObject({
            promptImageTokens: 0,
            completionImageTokens: 0.03,
        });
        expect(
            TEXT_SERVICES[
                "google/gemini-3.7-flash:openrouter:ai-studio-priority"
            ].cost,
        ).toMatchObject({
            promptCacheWriteTokens: 1.35 / 1_000_000,
        });
        expect(
            TEXT_SERVICES[
                "google/gemini-3.5-flash-lite:openrouter:ai-studio-flex"
            ].cost,
        ).toMatchObject({
            promptCacheWriteTokens: 0.15 / 1_000_000,
        });
        expect(
            TEXT_SERVICES["moonshotai/kimi-k2.7-code:deepinfra"].cost,
        ).toMatchObject({
            promptCacheWriteTokens: 0.85 / 1_000_000,
        });
        expect(MODEL3D_SERVICES["microsoft/trellis-2:fal"].cost).toEqual({
            completionImageTokens: 0.25,
        });
    });

    it("keeps Llama Vertex inside its verified request limits", () => {
        const route =
            TEXT_SERVICES["meta/llama-4-scout:openrouter:vertex-us-east5"];
        expect(supportsTextFallbackRequest(route, {})).toBe(true);
        expect(
            supportsTextFallbackRequest(route, { tool_choice: "none" }),
        ).toBe(true);
        expect(
            supportsTextFallbackRequest(route, { tool_choice: "auto" }),
        ).toBe(true);
        expect(
            supportsTextFallbackRequest(route, {
                tool_choice: { type: "allowed_tools", mode: "auto" },
            }),
        ).toBe(true);
        expect(
            supportsTextFallbackRequest(route, { tool_choice: "required" }),
        ).toBe(false);
        expect(
            supportsTextFallbackRequest(route, {
                tool_choice: {
                    type: "function",
                    function: { name: "weather" },
                },
            }),
        ).toBe(false);
        expect(
            supportsTextFallbackRequest(route, {
                function_call: { name: "weather" },
            }),
        ).toBe(false);
        expect(supportsTextFallbackRequest(route, { max_tokens: 8192 })).toBe(
            true,
        );
        expect(supportsTextFallbackRequest(route, { max_tokens: 8193 })).toBe(
            false,
        );

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
        expect(supportsTextFallbackRequest(route, images(5))).toBe(true);
        expect(supportsTextFallbackRequest(route, images(6))).toBe(false);
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
        expect(
            findModelByName("deepseek/deepseek-v4-flash:deepinfra")?.config(),
        ).toMatchObject({
            "custom-host": "https://api.deepinfra.com/v1/openai",
            model: "deepseek-ai/DeepSeek-V4-Flash-0731",
        });
        expect(
            findModelByName("qwen/qwen3.7-flash:alibaba")?.config(),
        ).toMatchObject({
            directEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            model: "qwen3.7-flash",
            defaultOptions: { max_tokens: 64000 },
        });
        expect(
            findModelByName("qwen/qwen3.8-flash:alibaba")?.config(),
        ).toMatchObject({
            directEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            model: "qwen3.8-flash",
            defaultOptions: { max_tokens: 64000 },
        });
        expect(TEXT_SERVICES["qwen/qwen3.8-flash:alibaba"].cost).toEqual(
            TEXT_SERVICES["qwen/qwen3.8-flash"].cost,
        );
        expect(
            findModelByName("mistralai/mistral-small-3.2:deepinfra")?.config(),
        ).toMatchObject({
            "custom-host": "https://api.deepinfra.com/v1/openai",
            model: "mistralai/Mistral-Small-3.2-24B-Instruct-2506",
        });
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

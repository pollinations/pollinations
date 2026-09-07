import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { AUDIO_FALLBACKS } from "@shared/registry/audio-fallbacks.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { IMAGE_FALLBACKS } from "@shared/registry/image-fallbacks.ts";
import { mergeFallbacks } from "@shared/registry/merge-fallbacks.ts";
import { MODEL3D_SERVICES } from "@shared/registry/model3d.ts";
import {
    getModels,
    getRegistryModelDefinition,
    getVisibleAudioModels,
    getVisibleImageModels,
    getVisibleTextModels,
    type ModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { TEXT_FALLBACKS } from "@shared/registry/text-fallbacks.ts";
import { describe, expect, it } from "vitest";
import { findModelByName } from "../src/text/availableModels.ts";
import { supportsTextFallbackRequest } from "../src/text/fallbackCompatibility.ts";

const OPENROUTER_ROUTES = [
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
        routeId,
        aliases: [],
        hidden: true,
        fallbackOnly: true,
        author: parent.author,
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
    it("gives every bundled route a unique execution ID without exposing primary IDs as aliases", () => {
        const routeIds = new Set<string>();
        for (const id of getModels()) {
            const definition = getRegistryModelDefinition(id);
            const routeId = definition.routeId;
            expect(routeId, id).toBeDefined();
            if (!routeId) throw new Error(`Missing execution ID for ${id}`);
            expect(routeId).toBe(routeId.toLowerCase());
            expect(routeIds.has(routeId)).toBe(false);
            routeIds.add(routeId);
            if (definition.fallbackOnly) {
                expect(routeId).toBe(id);
            } else {
                expect(
                    routeId === `${id}:${definition.provider}` ||
                        routeId.startsWith(`${id}:${definition.provider}:`),
                ).toBe(true);
                expect(() => resolveModelName(routeId)).toThrow();
            }
        }
        expect(routeIds.size).toBe(getModels().length);
    });

    it("binds every pinned OpenRouter text route ID to its configured endpoint", () => {
        for (const [id, definition] of Object.entries(TEXT_SERVICES)) {
            if (definition.provider !== "openrouter") continue;
            const model = findModelByName(id);
            if (!model) throw new Error(`Missing text config for ${id}`);
            const options = model.config().defaultOptions as {
                provider?: { only?: string[]; allow_fallbacks?: boolean };
            };
            const routing = options?.provider;
            if (
                routing?.only?.length !== 1 ||
                routing.allow_fallbacks !== false
            ) {
                expect(definition.routeId).toBe(`${id}:openrouter`);
                continue;
            }
            const qualifier = routing.only[0]
                .toLowerCase()
                .replace(/^google-vertex/, "vertex")
                .replace(/^google-ai-studio/, "ai-studio")
                .replaceAll("/", "-");
            expect(
                definition.routeId?.endsWith(`:openrouter:${qualifier}`),
                id,
            ).toBe(true);
        }
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

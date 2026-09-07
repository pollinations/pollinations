import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { AUDIO_FALLBACKS } from "@shared/registry/audio-fallbacks.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { IMAGE_FALLBACKS } from "@shared/registry/image-fallbacks.ts";
import { MODEL3D_SERVICES } from "@shared/registry/model3d.ts";
import {
    getVisibleAudioModels,
    getVisibleImageModels,
    getVisibleTextModels,
    type ModelDefinition,
} from "@shared/registry/registry.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { TEXT_FALLBACKS } from "@shared/registry/text-fallbacks.ts";
import { describe, expect, it } from "vitest";
import { findModelByName } from "../src/text/availableModels.ts";
import { supportsTextFallbackRequest } from "../src/text/fallbackCompatibility.ts";

const OPENROUTER_ROUTES = [
    ["qwen/qwen3.8-27b:fallback", "qwen/qwen3.8-27b", "akashml/fp8"],
    [
        "mistralai/mistral-large-3:fallback",
        "mistralai/mistral-large-2512",
        "mistral/zdr",
    ],
    [
        "anthropic/claude-opus-4.7:fallback",
        "anthropic/claude-opus-4.7",
        "google-vertex/global",
    ],
    [
        "meta/llama-4-scout:fallback",
        "meta-llama/llama-4-scout",
        "google-vertex/us-east5",
    ],
    ["x-ai/grok-4.20:fallback", "x-ai/grok-4.20", "xai/zdr"],
    ["x-ai/grok-4.3:fallback", "x-ai/grok-4.3", "xai/zdr"],
    [
        "anthropic/claude-haiku-4.5:fallback",
        "anthropic/claude-haiku-4.5",
        "google-vertex/global",
    ],
    [
        "anthropic/claude-fable-5:fallback",
        "anthropic/claude-fable-5",
        "google-vertex/global",
    ],
    [
        "meta/muse-glimmer-30b:fallback",
        "meta/muse-glimmer-30b",
        "deepinfra/bf16",
    ],
    [
        "nvidia/nemotron-3.5-lightning:fallback",
        "nvidia/nemotron-3.5-lightning",
        "coreweave/bf16",
    ],
    [
        "mistralai/mistral-small-4:fallback",
        "mistralai/mistral-small-2603",
        "mistral/eu",
    ],
    [
        "google/gemini-3.7-flash:fallback",
        "google/gemini-3.7-flash",
        "google-ai-studio/priority",
    ],
    [
        "google/gemini-2.5-flash-lite:fallback",
        "google/gemini-2.5-flash-lite",
        "google-ai-studio",
    ],
    [
        "google/gemini-3.5-flash-lite:fallback",
        "google/gemini-3.5-flash-lite",
        "google-ai-studio/flex",
    ],
    [
        "google/gemini-3.1-pro-preview:fallback",
        "google/gemini-3.1-pro-preview",
        "google-ai-studio",
    ],
    [
        "qwen/qwen3-vl-235b-a22b-thinking:fallback",
        "qwen/qwen3-vl-235b-a22b-thinking",
        "novita/bf16",
    ],
    ["z-ai/glm-5.3:fallback", "z-ai/glm-5.3", "friendli"],
    ["qwen/qwen3-coder-next:fallback", "qwen/qwen3-coder-next", "streamlake"],
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
    expect(
        routeId === `${parentId}:fallback` ||
            routeId.startsWith(`${parentId}:fallback:`),
    ).toBe(true);
    expect(parent.fallbacks).toContain(routeId);
    expect(route).toMatchObject({
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
            "microsoft/trellis-2:fallback",
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
            TEXT_SERVICES["deepseek/deepseek-v4-flash:fallback"].cost,
        ).toMatchObject({
            promptTextTokens: 0.08 / 1_000_000,
            completionTextTokens: 0.18 / 1_000_000,
        });
        expect(TEXT_SERVICES["meta/llama-4-scout:fallback"].cost).toMatchObject(
            {
                promptTextTokens: 0.25 / 1_000_000,
                promptImageTokens: 0.25 / 1_000_000,
                completionTextTokens: 0.7 / 1_000_000,
            },
        );
        expect(IMAGE_SERVICES["qwen/qwen-image-3:fallback"].cost).toMatchObject(
            {
                promptImageTokens: 0,
                completionImageTokens: 0.03,
            },
        );
        expect(
            TEXT_SERVICES["google/gemini-3.7-flash:fallback"].cost,
        ).toMatchObject({
            promptCacheWriteTokens: 1.35 / 1_000_000,
        });
        expect(
            TEXT_SERVICES["google/gemini-3.5-flash-lite:fallback"].cost,
        ).toMatchObject({
            promptCacheWriteTokens: 0.15 / 1_000_000,
        });
        expect(
            TEXT_SERVICES["moonshotai/kimi-k2.7-code:fallback"].cost,
        ).toMatchObject({
            promptCacheWriteTokens: 0.85 / 1_000_000,
        });
        expect(MODEL3D_SERVICES["microsoft/trellis-2:fallback"].cost).toEqual({
            completionImageTokens: 0.25,
        });
    });

    it("keeps Llama Vertex inside its verified request limits", () => {
        const route = TEXT_SERVICES["meta/llama-4-scout:fallback"];
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
            findModelByName("deepseek/deepseek-v4-flash:fallback")?.config(),
        ).toMatchObject({
            "custom-host": "https://api.deepinfra.com/v1/openai",
            model: "deepseek-ai/DeepSeek-V4-Flash-0731",
        });
        expect(
            findModelByName("qwen/qwen3.7-flash:fallback")?.config(),
        ).toMatchObject({
            directEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            model: "qwen3.7-flash",
            defaultOptions: { max_tokens: 64000 },
        });
        expect(
            findModelByName("qwen/qwen3.8-flash:fallback")?.config(),
        ).toMatchObject({
            directEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            model: "qwen3.8-flash",
            defaultOptions: { max_tokens: 64000 },
        });
        expect(TEXT_SERVICES["qwen/qwen3.8-flash:fallback"].cost).toEqual(
            TEXT_SERVICES["qwen/qwen3.8-flash"].cost,
        );
        expect(
            findModelByName("mistralai/mistral-small-3.2:fallback")?.config(),
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

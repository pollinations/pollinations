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

const OPENROUTER_ROUTES = [
    ["qwen3.8-27b-openrouter-akashml", "qwen/qwen3.8-27b", "akashml/fp8"],
    [
        "mistral-large-openrouter-zdr",
        "mistralai/mistral-large-2512",
        "mistral/zdr",
    ],
    [
        "claude-opus-4.7-openrouter-vertex",
        "anthropic/claude-opus-4.7",
        "google-vertex/global",
    ],
    [
        "llama-scout-openrouter-deepinfra",
        "meta-llama/llama-4-scout",
        "deepinfra/fp8",
    ],
    ["grok-openrouter-xai-zdr", "x-ai/grok-4.20", "xai/zdr"],
    ["grok-large-openrouter-xai-zdr", "x-ai/grok-4.3", "xai/zdr"],
    [
        "claude-fast-openrouter-vertex",
        "anthropic/claude-haiku-4.5",
        "google-vertex/global",
    ],
    [
        "claude-fable-5-openrouter-vertex",
        "anthropic/claude-fable-5",
        "google-vertex/global",
    ],
    [
        "muse-glimmer-openrouter-deepinfra",
        "meta/muse-glimmer-30b",
        "deepinfra/bf16",
    ],
    [
        "nemotron-3.5-lightning-openrouter-coreweave",
        "nvidia/nemotron-3.5-lightning",
        "coreweave/bf16",
    ],
    ["mistral-openrouter-eu", "mistralai/mistral-small-2603", "mistral/eu"],
    [
        "gemini-openrouter-ai-studio-priority",
        "google/gemini-3.7-flash",
        "google-ai-studio/priority",
    ],
    [
        "gemini-fast-openrouter-ai-studio",
        "google/gemini-2.5-flash-lite",
        "google-ai-studio",
    ],
    [
        "gemini-flash-lite-3.5-openrouter-ai-studio-flex",
        "google/gemini-3.5-flash-lite",
        "google-ai-studio/flex",
    ],
    [
        "gemini-large-openrouter-ai-studio",
        "google/gemini-3.1-pro-preview",
        "google-ai-studio",
    ],
    [
        "qwen-vision-pro-openrouter-novita",
        "qwen/qwen3-vl-235b-a22b-thinking",
        "novita/bf16",
    ],
    ["glm-5.3-openrouter-friendli", "z-ai/glm-5.3", "friendli"],
    [
        "qwen-coder-large-openrouter-streamlake",
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
    expect(parent.fallbacks).toContain(routeId);
    expect(route).toMatchObject({
        aliases: [],
        hidden: true,
        fallbackOnly: true,
        brand: parent.brand,
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
        expectInheritedRoute(MODEL3D_SERVICES, "trellis-2", "trellis-2-fal");
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
        expect(TEXT_SERVICES["deepseek-deepinfra"].cost).toMatchObject({
            promptTextTokens: 0.08 / 1_000_000,
            completionTextTokens: 0.18 / 1_000_000,
        });
        expect(IMAGE_SERVICES["qwen-image-3-replicate"].cost).toMatchObject({
            promptImageTokens: 0,
            completionImageTokens: 0.03,
        });
        expect(
            TEXT_SERVICES["qwen3.8-27b-openrouter-akashml"].cost,
        ).toMatchObject({
            promptCachedTokens: 0.05 / 1_000_000,
        });
        expect(
            TEXT_SERVICES["gemini-openrouter-ai-studio-priority"].cost,
        ).toMatchObject({
            promptCacheWriteTokens: 1.35 / 1_000_000,
        });
        expect(
            TEXT_SERVICES["gemini-flash-lite-3.5-openrouter-ai-studio-flex"]
                .cost,
        ).toMatchObject({
            promptCacheWriteTokens: 0.15 / 1_000_000,
        });
        expect(TEXT_SERVICES["kimi-code-deepinfra"].cost).toMatchObject({
            promptCacheWriteTokens: 0.85 / 1_000_000,
        });
        expect(MODEL3D_SERVICES["trellis-2-fal"].cost).toEqual({
            completionImageTokens: 0.25,
        });
    });

    it("binds fallback-only text ids to their exact provider routes", () => {
        expect(findModelByName("deepseek-deepinfra")?.config()).toMatchObject({
            "custom-host": "https://api.deepinfra.com/v1/openai",
            model: "deepseek-ai/DeepSeek-V4-Flash-0731",
        });
        expect(
            findModelByName("qwen3.7-flash-alibaba")?.config(),
        ).toMatchObject({
            directEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            model: "qwen3.7-flash",
            defaultOptions: { max_tokens: 64000 },
        });
        expect(
            findModelByName("mistral-small-3.2-deepinfra")?.config(),
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

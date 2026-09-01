import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { MODEL3D_SERVICES } from "@shared/registry/model3d.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { describe, expect, it } from "vitest";
import { findModelByName } from "../src/text/availableModels.ts";

const TEXT_ROUTES = {
    deepseek: "deepseek-deepinfra",
    "minimax-m2.7": "minimax-m2.7-deepinfra",
    "qwen3.8-2.4t-a95b": "qwen3.8-2.4t-a95b-deepinfra",
    "qwen3.8-27b": "qwen3.8-27b-openrouter",
    kimi: "kimi-deepinfra",
    llama: "llama-deepinfra",
    "mistral-large": "mistral-large-openrouter",
    gemma: "gemma-deepinfra",
    "gemma-4-31b": "gemma-4-31b-deepinfra",
    "claude-opus-4.7": "claude-opus-4.7-openrouter",
} as const;

const IMAGE_ROUTES = {
    kontext: "kontext-replicate",
    "flux-2-pro": "flux-2-pro-replicate",
    "qwen-image-3": "qwen-image-3-replicate",
    "p-image-edit": "p-image-edit-replicate",
} as const;

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
        brand: parent.brand,
        category: parent.category,
        title: parent.title,
        inputModalities: parent.inputModalities,
        outputModalities: parent.outputModalities,
    });
    expect(route.fallbacks).toBeUndefined();
}

describe("static provider fallbacks", () => {
    it("registers exact text routes as hidden inherited models", () => {
        for (const [parent, route] of Object.entries(TEXT_ROUTES)) {
            expectInheritedRoute(TEXT_SERVICES, parent, route);
            expect(findModelByName(route)).not.toBeNull();
        }
    });

    it("registers image and 3D routes without public aliases", () => {
        for (const [parent, route] of Object.entries(IMAGE_ROUTES)) {
            expectInheritedRoute(IMAGE_SERVICES, parent, route);
        }
        expectInheritedRoute(MODEL3D_SERVICES, "trellis-2", "trellis-2-fal");
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
        expect(MODEL3D_SERVICES["trellis-2-fal"].cost).toEqual({
            completionImageTokens: 0.25,
        });
        for (const route of [
            "qwen3.8-27b-openrouter",
            "mistral-large-openrouter",
            "claude-opus-4.7-openrouter",
        ] as const) {
            expect(TEXT_SERVICES[route].paidOnly).toBe(true);
        }
    });

    it("binds hidden text ids to their exact provider routes", () => {
        expect(findModelByName("deepseek-deepinfra")?.config()).toMatchObject({
            "custom-host": "https://api.deepinfra.com/v1/openai",
            model: "deepseek-ai/DeepSeek-V4-Flash-0731",
        });
        expect(
            findModelByName("qwen3.8-27b-openrouter")?.config(),
        ).toMatchObject({
            model: "qwen/qwen3.8-27b",
            defaultOptions: {
                provider: {
                    only: ["ionstream/fp8", "reka/fp8", "akashml/fp8"],
                    allow_fallbacks: true,
                },
            },
        });
        expect(
            findModelByName("claude-opus-4.7-openrouter")?.config(),
        ).toMatchObject({
            model: "anthropic/claude-opus-4.7",
            defaultOptions: {
                provider: {
                    only: ["google-vertex/global", "anthropic", "azure/global"],
                    allow_fallbacks: true,
                },
            },
        });
    });
});

import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";
import { resolveModelConfig } from "../../../src/text/utils/modelResolver.js";

describe("Vertex Gemini routing with OpenRouter fallback", () => {
    const routes = [
        [
            "gemini-3-flash",
            "gemini-3-flash-preview",
            "google/gemini-3-flash-preview:openrouter:vertex-global",
            "google-vertex/global",
        ],
        [
            "gemini-fast",
            "gemini-2.5-flash-lite",
            "google/gemini-2.5-flash-lite:openrouter:vertex-eu",
            "google-vertex/eu",
        ],
        [
            "gemini-large",
            "gemini-3.1-pro-preview",
            "google/gemini-3.1-pro-preview:openrouter:vertex-global",
            "google-vertex/global",
        ],
        [
            "gemini",
            "gemini-3.7-flash",
            "google/gemini-3.7-flash:openrouter:vertex-global",
            "google-vertex/global",
        ],
        [
            "google/gemini-3.8-flash",
            "gemini-3.8-flash",
            "google/gemini-3.8-flash:openrouter:vertex-global",
            "google-vertex/global",
        ],
        [
            "gemini-flash-lite-3.5",
            "gemini-3.5-flash-lite",
            "google/gemini-3.5-flash-lite:openrouter:vertex-global",
            "google-vertex/global",
        ],
    ] as const;

    it.each(
        routes,
    )("routes %s directly to Vertex %s", (model, upstreamModel) => {
        const { options } = resolveModelConfig([], { model });

        expect(options.model).toBe(upstreamModel);
        expect(options.provider).toBeUndefined();
        expect(options.modelConfig).toMatchObject({
            provider: "vertex-ai",
            "vertex-region": "global",
            "vertex-model-id": upstreamModel,
            "strict-openai-compliance": "false",
        });
    });

    it.each(
        routes,
    )("pins the %s fallback to %s", (_model, upstreamModel, fallback, providerTag) => {
        const { options } = resolveModelConfig([], { model: fallback });

        expect(options.model).toBe(`google/${upstreamModel}`);
        expect(options.provider).toEqual({
            only: [providerTag],
            allow_fallbacks: false,
        });
        expect(options.modelConfig).toMatchObject({
            provider: "openrouter",
            directEndpoint: "https://openrouter.ai/api/v1/chat/completions",
        });
    });

    it.each(
        routes,
    )("publishes direct Vertex parameters for %s and OpenRouter parameters for its fallback", (_model, _upstreamModel, fallback) => {
        const primary = fallback.split(
            ":openrouter:",
        )[0] as keyof typeof TEXT_SERVICES;
        const direct = TEXT_SERVICES[primary].supportedParameters ?? [];
        const openRouter = TEXT_SERVICES[fallback].supportedParameters ?? [];

        expect(direct).toContain("reasoning_effort");
        expect(direct).not.toContain("reasoning");
        expect(direct).not.toContain("include_reasoning");
        expect(openRouter).toContain("reasoning");
        expect(openRouter).toContain("include_reasoning");
    });

    it.each(
        routes.map(([model]) => model),
    )("does not inject code execution for %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error(`${model} transform missing`);

        const { options } = await transform([], { model });

        expect(options.tools).toBeUndefined();
    });

    it.each(
        routes.map(([model]) => model),
    )("adapts explicit Google Search for direct %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error(`${model} transform missing`);

        const { options } = await transform([], {
            tools: [{ type: "google_search" }],
        });

        expect(options.tools).toEqual([
            {
                type: "function",
                function: { name: "google_search" },
            },
        ]);
    });

    it.each(
        routes.map(([, , fallback]) => fallback),
    )("adapts Google Search for OpenRouter fallback %s", async (fallback) => {
        const transform = findModelByName(fallback)?.transform;
        if (!transform) throw new Error(`${fallback} transform missing`);

        const { options } = await transform([], {
            tools: [{ type: "google_search" }],
        });

        expect(options.tools).toEqual([
            {
                type: "openrouter:web_search",
                parameters: { engine: "native" },
            },
        ]);
    });

    it.each(
        routes.map(([model]) => model),
    )("preserves tools with structured output for %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error(`${model} transform missing`);
        const tools = [
            {
                type: "function",
                function: {
                    name: "lookup",
                    parameters: { type: "object", properties: {} },
                },
            },
        ];

        const { options } = await transform([], {
            tools,
            response_format: { type: "json_object" },
        });

        expect(options.tools).toEqual(tools);
    });
});

describe("Vertex Gemini Search routing", () => {
    const routes = [
        "google/gemini-2.5-flash-lite:search",
        "gemini-search",
        "gemini-2.5-flash-search",
        "gemini-2.5-flash-lite-search",
        "gemini-search-fast",
        "gemini-3.1-flash-lite-search",
        "gemini-3.5-flash-lite-search",
        "gemini-search-large",
        "gemini-3.6-flash-search",
        "gemini-3.5-flash-search",
    ] as const;

    it.each(routes)("routes %s directly to Vertex", (model) => {
        const upstreamModel = "gemini-2.5-flash-lite";
        const { options } = resolveModelConfig([], { model });

        expect(options.model).toBe(upstreamModel);
        expect(options.modelConfig).toMatchObject({
            provider: "vertex-ai",
            "vertex-region": "global",
            "vertex-model-id": upstreamModel,
            "strict-openai-compliance": "false",
        });
        expect(options.provider).toBeUndefined();
    });

    it.each(routes)("adds native Google Search for %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error(`${model} transform missing`);

        const { options } = await transform(
            [{ role: "user", content: "latest news" }],
            { model },
        );

        expect(options.tools).toEqual([
            {
                type: "function",
                function: { name: "google_search" },
            },
        ]);
    });

    it.each(
        routes,
    )("adapts the public Google Search shape for %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error(`${model} transform missing`);

        const { options } = await transform([], {
            model,
            tools: [{ type: "google_search" }],
        });

        expect(options.tools).toEqual([
            {
                type: "function",
                function: { name: "google_search" },
            },
        ]);
    });

    it("preserves logit_bias on the direct Vertex route", async () => {
        const transform = findModelByName("gemini-search")?.transform;
        if (!transform) throw new Error("gemini-search transform missing");

        const { options } = await transform([], {
            logit_bias: { "1": -1 },
        });

        expect(options.logit_bias).toEqual({ "1": -1 });
    });

    it("preserves logit_bias with explicit search on the 2.5 route", async () => {
        const transform = findModelByName("gemini-fast")?.transform;
        if (!transform) throw new Error("gemini-fast transform missing");

        const { options } = await transform([], {
            tools: [{ type: "google_search" }],
            logit_bias: { "1": -1 },
        });

        expect(options.logit_bias).toEqual({ "1": -1 });
    });

    it("preserves logit_bias without native search on the 2.5 route", async () => {
        const transform = findModelByName("gemini-fast")?.transform;
        if (!transform) throw new Error("gemini-fast transform missing");

        const { options } = await transform([], {
            logit_bias: { "1": -1 },
        });

        expect(options.logit_bias).toEqual({ "1": -1 });
    });
});

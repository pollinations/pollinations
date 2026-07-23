import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";
import { resolveModelConfig } from "../../../src/text/utils/modelResolver.js";

describe("OpenRouter Gemini routing", () => {
    const routes = [
        [
            "gemini-3-flash",
            "google/gemini-3-flash-preview",
            "google-vertex/global",
        ],
        ["gemini", "google/gemini-3.6-flash", "google-vertex/global"],
        [
            "gemini-flash-lite-3.5",
            "google/gemini-3.5-flash-lite",
            "google-vertex/global",
        ],
        ["gemini-search", "google/gemini-2.5-flash-lite", "google-vertex/eu"],
        ["gemini-fast", "google/gemini-2.5-flash-lite", "google-vertex/eu"],
        [
            "gemini-search-fast",
            "google/gemini-3.5-flash-lite",
            "google-vertex/global",
        ],
        [
            "gemini-search-large",
            "google/gemini-3.6-flash",
            "google-vertex/global",
        ],
        [
            "gemini-large",
            "google/gemini-3.1-pro-preview",
            "google-vertex/global",
        ],
    ] as const;

    it.each(
        routes,
    )("pins %s to %s on %s without fallback", (model, upstreamModel, providerTag) => {
        const { options } = resolveModelConfig([], { model });

        expect(options.model).toBe(upstreamModel);
        expect(options.provider).toEqual({
            only: [providerTag],
            allow_fallbacks: false,
        });
        expect(options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://openrouter.ai/api/v1",
        });
    });

    it.each([
        "gemini-3-flash",
        "gemini",
        "gemini-flash-lite-3.5",
        "gemini-fast",
        "gemini-large",
    ])("does not inject code execution for %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error(`${model} transform missing`);

        const { options } = await transform([], {});

        expect(options.tools).toBeUndefined();
    });

    it.each([
        "gemini-search",
        "gemini-search-fast",
        "gemini-search-large",
    ])("injects search but not code execution for %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error(`${model} transform missing`);

        const { options } = await transform([], {});

        expect(options.tools).not.toContainEqual({ type: "code_execution" });
        expect(options.tools).toContainEqual({
            type: "openrouter:web_search",
            parameters: { engine: "native" },
        });
    });

    it.each(
        routes.map(([model]) => model),
    )("adapts explicit Google Search for %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error(`${model} transform missing`);

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
    )("adapts legacy Google Search functions for %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error(`${model} transform missing`);

        const { options } = await transform([], {
            tools: [{ type: "function", function: { name: "google_search" } }],
        });

        expect(options.tools).toEqual([
            {
                type: "openrouter:web_search",
                parameters: { engine: "native" },
            },
        ]);
    });
});

describe("OpenRouter Gemini native search", () => {
    it.each([
        "gemini-search",
        "gemini-search-fast",
        "gemini-search-large",
    ])("adds provider-native Google Search for %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error(`${model} transform missing`);

        const { options } = await transform(
            [{ role: "user", content: "latest news" }],
            {},
        );

        expect(options.tools).toEqual([
            {
                type: "openrouter:web_search",
                parameters: { engine: "native" },
            },
        ]);
    });

    it("preserves explicit user tools", async () => {
        const transform = findModelByName("gemini-search-fast")?.transform;
        if (!transform) throw new Error("gemini-search-fast transform missing");
        const tools = [
            { type: "function", function: { name: "customer_tool" } },
        ];

        const { options } = await transform([], { tools });

        expect(options.tools).toEqual(tools);
    });

    it("drops logit_bias from the 2.5 search route", async () => {
        const transform = findModelByName("gemini-search")?.transform;
        if (!transform) throw new Error("gemini-search transform missing");

        const { options } = await transform([], {
            logit_bias: { "1": -1 },
        });

        expect(options.logit_bias).toBeUndefined();
    });

    it("drops logit_bias from explicit search on the 2.5 general route", async () => {
        const transform = findModelByName("gemini-fast")?.transform;
        if (!transform) throw new Error("gemini-fast transform missing");

        const { options } = await transform([], {
            tools: [{ type: "google_search" }],
            logit_bias: { "1": -1 },
        });

        expect(options.logit_bias).toBeUndefined();
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

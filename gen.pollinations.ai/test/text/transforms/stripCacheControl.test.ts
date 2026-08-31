import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";
import { stripCacheControl } from "../../../src/text/transforms/stripCacheControl.js";

describe("stripCacheControl", () => {
    it("strips cache_control from typed text content parts", () => {
        const messages = [
            {
                role: "user" as const,
                content: [
                    {
                        type: "text",
                        text: "hi",
                        cache_control: { type: "ephemeral" },
                    },
                ],
            },
        ];

        const { messages: result } = stripCacheControl(messages, {});

        expect(result[0].content).toEqual([{ type: "text", text: "hi" }]);
    });

    it("leaves plain string content untouched (identity preserved)", () => {
        const messages = [{ role: "user" as const, content: "hello" }];

        const { messages: result } = stripCacheControl(messages, {});

        expect(result[0]).toBe(messages[0]);
    });

    it("preserves messages with no cache_control (identity preserved)", () => {
        const messages = [
            {
                role: "user" as const,
                content: [{ type: "text", text: "hi" }],
            },
        ];

        const { messages: result } = stripCacheControl(messages, {});

        expect(result[0]).toBe(messages[0]);
    });
});

describe("stripCacheControl model wiring", () => {
    // Strict OpenAI-compatible providers reject Anthropic-style cache_control
    // annotations, so affected models must strip them without dropping history.
    it.each([
        "grok",
        "nemotron-3.5-lightning",
        "thinkingmachines/inkling",
    ])("wires cache_control stripping onto %s", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);

        const { messages: result } = await transform(
            [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "hi",
                            cache_control: { type: "ephemeral" },
                        },
                    ],
                },
            ],
            {},
        );

        expect(result[0].content).toEqual([{ type: "text", text: "hi" }]);
    });

    it.each([
        "grok-large",
        "grok-4.3",
        "grok-4.6",
    ])("wires stripCacheControl onto %s", (modelName) => {
        expect(findModelByName(modelName)?.transform).toBe(stripCacheControl);
    });
});

describe("cache_control passthrough (vertex explicit caching)", () => {
    // Vertex explicit context caching (pollinations/gateway#8) engages on
    // content-block cache_control markers. If a gemini pipe ever strips them
    // (e.g. stripCacheControl gets copy-pasted onto a gemini model), caching
    // silently degrades to uncached requests — no error, just full price.
    it.each([
        "gemini-3-flash",
        "gemini",
        "gemini-flash-lite-3.5",
        "gemini-fast",
        "gemini-large",
    ])("%s transform preserves content-block cache_control markers", async (modelName) => {
        const model = findModelByName(modelName);
        if (!model?.transform)
            throw new Error(`${modelName} model or transform missing`);

        const { messages: result } = await model.transform(
            [
                {
                    role: "system",
                    content: [
                        {
                            type: "text",
                            text: "big static prefix",
                            cache_control: { type: "ephemeral" },
                        },
                    ],
                },
                { role: "user", content: "dynamic tail" },
            ],
            {},
        );

        expect(result[0].content).toEqual([
            {
                type: "text",
                text: "big static prefix",
                cache_control: { type: "ephemeral" },
            },
        ]);
    });
});

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
    // Azure-deployed Grok rejects cache_control like its sibling Azure/strict
    // OpenAI-compatible models; all grok entries must carry the transform so
    // multi-turn history isn't dropped (see issue #10722).
    it("wires cache_control stripping onto grok", async () => {
        const transform = findModelByName("grok")?.transform;
        if (!transform) throw new Error("grok transform missing");

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
    ])("wires stripCacheControl onto %s", (modelName) => {
        expect(findModelByName(modelName)?.transform).toBe(stripCacheControl);
    });
});

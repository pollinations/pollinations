import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";
import { stripReasoningEffort } from "../../../src/text/transforms/stripReasoningEffort.js";

describe("stripReasoningEffort", () => {
    it("drops reasoning_effort from options", () => {
        const { options } = stripReasoningEffort([], {
            reasoning_effort: "high",
            temperature: 0.5,
        });

        expect(options.reasoning_effort).toBeUndefined();
        expect(options.temperature).toBe(0.5);
    });

    it("preserves options when reasoning_effort is absent (identity preserved)", () => {
        const original = { temperature: 0.5 };

        const { options } = stripReasoningEffort([], original);

        expect(options).toBe(original);
    });

    it("passes messages through untouched", () => {
        const messages = [{ role: "user" as const, content: "hi" }];

        const { messages: result } = stripReasoningEffort(messages, {
            reasoning_effort: "high",
        });

        expect(result).toBe(messages);
    });
});

describe("stripReasoningEffort model wiring", () => {
    // Only the non-reasoning Grok deployment (grok-4-20-non-reasoning) 500s on
    // reasoning_effort; the reasoning variants must keep accepting it.
    it("wires reasoning_effort stripping onto grok while preserving cache_control stripping", async () => {
        const transform = findModelByName("grok")?.transform;
        if (!transform) throw new Error("grok transform missing");

        const { messages: resultMessages, options } = await transform(
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
            {
                reasoning_effort: "high",
                temperature: 0.5,
            },
        );

        expect(options.reasoning_effort).toBeUndefined();
        expect(options.temperature).toBe(0.5);
        expect(resultMessages[0].content).toEqual([
            { type: "text", text: "hi" },
        ]);
    });

    it.each([
        "grok-large",
        "grok-4.3",
    ])("does not strip reasoning_effort on %s (reasoning model)", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);

        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "high",
        });
        expect(options.reasoning_effort).toBe("high");
    });
});

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
    it("wires stripReasoningEffort onto grok (non-reasoning)", () => {
        expect(findModelByName("grok")?.transform).toBe(stripReasoningEffort);
    });

    it.each([
        "grok-large",
        "grok-4.3",
    ])("does not strip reasoning_effort on %s (reasoning model)", (modelName) => {
        expect(findModelByName(modelName)?.transform).not.toBe(
            stripReasoningEffort,
        );
    });
});

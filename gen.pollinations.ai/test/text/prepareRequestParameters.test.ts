import { describe, expect, it } from "vitest";
import { prepareRequestParameters } from "../../src/text/handler.js";
import type { RequestData } from "../../src/text/types.js";

const base = (overrides: Partial<RequestData>): RequestData =>
    ({
        messages: [{ role: "user", content: "hi" }],
        ...overrides,
    }) as RequestData;

describe("prepareRequestParameters", () => {
    it("strips reasoning_effort for non-reasoning models", () => {
        // The non-reasoning Grok deployment returns an opaque upstream 500 if
        // reasoning_effort is forwarded, so it must be dropped here.
        const result = prepareRequestParameters(
            base({ model: "grok", reasoning_effort: "high" }),
        );

        expect(result.reasoning_effort).toBeUndefined();
    });

    it("preserves reasoning_effort for reasoning-capable models", () => {
        const result = prepareRequestParameters(
            base({ model: "grok-large", reasoning_effort: "high" }),
        );

        expect(result.reasoning_effort).toBe("high");
    });

    it("leaves params untouched when reasoning_effort is absent", () => {
        const result = prepareRequestParameters(
            base({ model: "grok", temperature: 0.5 }),
        );

        expect(result.reasoning_effort).toBeUndefined();
        expect(result.temperature).toBe(0.5);
    });

    it("still injects audio defaults while stripping reasoning_effort", () => {
        const result = prepareRequestParameters(
            base({ model: "openai-audio", reasoning_effort: "high" }),
        );

        expect(result.reasoning_effort).toBeUndefined();
        expect(result.modalities).toEqual(["text", "audio"]);
        expect(result.audio?.format).toBe("mp3");
    });
});

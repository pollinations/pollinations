import { describe, expect, it } from "vitest";
import { resolveModelConfig } from "../../../src/text/utils/modelResolver.js";

const messages = [{ role: "user" as const, content: "Hello" }];

describe("resolveModelConfig", () => {
    it("sets Anthropic max_tokens defaults", () => {
        expect(
            resolveModelConfig(messages, { model: "claude" }).options
                .max_tokens,
        ).toBe(64000);
        expect(
            resolveModelConfig(messages, { model: "claude-fast" }).options
                .max_tokens,
        ).toBe(64000);
        expect(
            resolveModelConfig(messages, { model: "claude-large" }).options
                .max_tokens,
        ).toBe(128000);
    });

    it("lets callers override Anthropic max_tokens", () => {
        const result = resolveModelConfig(messages, {
            model: "claude",
            max_tokens: 1024,
        });

        expect(result.options.max_tokens).toBe(1024);
    });

    it("does not set max_tokens for non-Anthropic models", () => {
        const result = resolveModelConfig(messages, { model: "openai" });

        expect(result.options.max_tokens).toBeUndefined();
    });

    it("resolves nova-fast to amazon.nova-micro-v1:0", () => {
        const result = resolveModelConfig(messages, { model: "nova-fast" });

        expect(result.options.model).toBe("amazon.nova-micro-v1:0");
    });

    it("marks missing model configs as 404 errors", () => {
        expect(() =>
            resolveModelConfig(messages, { model: "not-a-real-model" }),
        ).toThrow(
            expect.objectContaining({
                name: "ModelResolutionError",
                status: 404,
            }),
        );
    });
});

import { describe, expect, it } from "vitest";
import { resolveModelConfig } from "../utils/modelResolver.js";

const messages = [{ role: "user", content: "Hello" }];

describe("Anthropic max_tokens defaults", () => {
    it("should set max_tokens default for claude (sonnet-4-6)", () => {
        const result = resolveModelConfig(messages, { model: "claude" });
        expect(result.options.max_tokens).toBe(64000);
    });

    it("should set max_tokens default for claude-fast (haiku-4-5)", () => {
        const result = resolveModelConfig(messages, { model: "claude-fast" });
        expect(result.options.max_tokens).toBe(64000);
    });

    it("should set max_tokens default for claude-large (opus-4-6)", () => {
        const result = resolveModelConfig(messages, { model: "claude-large" });
        expect(result.options.max_tokens).toBe(128000);
    });

    it("should set max_tokens default for claude-legacy (opus-4-5)", () => {
        const result = resolveModelConfig(messages, { model: "claude-legacy" });
        expect(result.options.max_tokens).toBe(64000);
    });

    it("should allow user to override max_tokens", () => {
        const result = resolveModelConfig(messages, {
            model: "claude",
            max_tokens: 1024,
        });
        expect(result.options.max_tokens).toBe(1024);
    });

    it("should not set max_tokens for non-Anthropic models", () => {
        const result = resolveModelConfig(messages, { model: "openai" });
        expect(result.options.max_tokens).toBeUndefined();
    });
});

import { describe, expect, it } from "vitest";
import type { Usage } from "../../shared/registry/registry.ts";
import {
    buildUsageHeaders,
    openaiUsageToUsage,
    parseUsageHeaders,
} from "../../shared/registry/usage-headers.ts";

describe("buildUsageHeaders", () => {
    it("should include x-model-used header", () => {
        const usage: Usage = {
            promptTextTokens: 10,
            completionTextTokens: 20,
        };
        const headers = buildUsageHeaders("openai-fast", usage);

        expect(headers["x-model-used"]).toBe("openai-fast");
    });

    it("should include x-usage-prompt-text-tokens header", () => {
        const usage: Usage = {
            promptTextTokens: 42,
            completionTextTokens: 20,
        };
        const headers = buildUsageHeaders("openai", usage);

        expect(headers["x-usage-prompt-text-tokens"]).toBe("42");
    });

    it("should include x-usage-completion-text-tokens header", () => {
        const usage: Usage = {
            promptTextTokens: 10,
            completionTextTokens: 55,
        };
        const headers = buildUsageHeaders("openai", usage);

        expect(headers["x-usage-completion-text-tokens"]).toBe("55");
    });

    it("should include cached tokens header when present", () => {
        const usage: Usage = {
            promptTextTokens: 100,
            promptCachedTokens: 50,
            completionTextTokens: 20,
        };
        const headers = buildUsageHeaders("claude-large", usage);

        expect(headers["x-usage-prompt-cached-tokens"]).toBe("50");
    });

    it("should include reasoning tokens header when present", () => {
        const usage: Usage = {
            promptTextTokens: 100,
            completionTextTokens: 20,
            completionReasoningTokens: 150,
        };
        const headers = buildUsageHeaders("deepseek", usage);

        expect(headers["x-usage-completion-reasoning-tokens"]).toBe("150");
    });

    it("should omit zero-value headers", () => {
        const usage: Usage = {
            promptTextTokens: 10,
            completionTextTokens: 20,
            promptCachedTokens: 0,
        };
        const headers = buildUsageHeaders("openai", usage);

        expect(headers).not.toHaveProperty("x-usage-prompt-cached-tokens");
    });

    it("should include audio and video usage types", () => {
        const usage: Usage = {
            promptTextTokens: 10,
            promptAudioTokens: 500,
            completionAudioSeconds: 3.5,
            completionVideoSeconds: 10.2,
        };
        const headers = buildUsageHeaders("gemini-large", usage);

        expect(headers["x-usage-prompt-audio-tokens"]).toBe("500");
        expect(headers["x-usage-completion-audio-seconds"]).toBe("3.5");
        expect(headers["x-usage-completion-video-seconds"]).toBe("10.2");
    });
});

describe("openaiUsageToUsage", () => {
    it("should convert basic OpenAI usage format", () => {
        const openaiUsage = {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.promptTextTokens).toBe(100);
        expect(usage.completionTextTokens).toBe(50);
    });

    it("should handle cached tokens in prompt_tokens_details", () => {
        const openaiUsage = {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            prompt_tokens_details: {
                cached_tokens: 30,
            },
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.promptTextTokens).toBe(70); // 100 - 30
        expect(usage.promptCachedTokens).toBe(30);
    });

    it("should handle reasoning tokens in completion_tokens_details", () => {
        const openaiUsage = {
            prompt_tokens: 100,
            completion_tokens: 200,
            total_tokens: 300,
            completion_tokens_details: {
                reasoning_tokens: 150,
            },
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.completionTextTokens).toBe(50); // 200 - 150
        expect(usage.completionReasoningTokens).toBe(150);
    });

    it("should handle audio tokens in both prompt and completion", () => {
        const openaiUsage = {
            prompt_tokens: 100,
            completion_tokens: 200,
            total_tokens: 300,
            prompt_tokens_details: {
                audio_tokens: 40,
            },
            completion_tokens_details: {
                audio_tokens: 60,
            },
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.promptTextTokens).toBe(60); // 100 - 40
        expect(usage.promptAudioTokens).toBe(40);
        expect(usage.completionTextTokens).toBe(140); // 200 - 60
        expect(usage.completionAudioTokens).toBe(60);
    });
});

describe("parseUsageHeaders", () => {
    it("should parse headers back to Usage object", () => {
        const headers = {
            "x-model-used": "openai",
            "x-usage-prompt-text-tokens": "100",
            "x-usage-completion-text-tokens": "50",
        };

        const usage = parseUsageHeaders(headers);

        expect(usage.promptTextTokens).toBe(100);
        expect(usage.completionTextTokens).toBe(50);
    });

    it("should parse float values for duration fields", () => {
        const headers = {
            "x-usage-prompt-audio-seconds": "3.5",
            "x-usage-completion-audio-seconds": "10.25",
            "x-usage-completion-video-seconds": "15.75",
        };

        const usage = parseUsageHeaders(headers);

        expect(usage.promptAudioSeconds).toBe(3.5);
        expect(usage.completionAudioSeconds).toBe(10.25);
        expect(usage.completionVideoSeconds).toBe(15.75);
    });

    it("should handle Headers object (from Response)", () => {
        const headers = new Headers({
            "x-model-used": "claude-large",
            "x-usage-prompt-text-tokens": "200",
            "x-usage-prompt-cached-tokens": "100",
        });

        const usage = parseUsageHeaders(headers);

        expect(usage.promptTextTokens).toBe(200);
        expect(usage.promptCachedTokens).toBe(100);
    });

    it("should omit missing headers", () => {
        const headers = {
            "x-usage-prompt-text-tokens": "100",
        };

        const usage = parseUsageHeaders(headers);

        expect(usage.promptTextTokens).toBe(100);
        expect(usage.completionTextTokens).toBeUndefined();
        expect(usage.promptCachedTokens).toBeUndefined();
    });
});

describe("buildUsageHeaders + parseUsageHeaders round-trip", () => {
    it("should preserve usage data through build and parse cycle", () => {
        const originalUsage: Usage = {
            promptTextTokens: 100,
            promptCachedTokens: 50,
            promptAudioTokens: 200,
            completionTextTokens: 75,
            completionReasoningTokens: 150,
            completionAudioSeconds: 5.5,
        };

        const headers = buildUsageHeaders("test-model", originalUsage);
        const parsedUsage = parseUsageHeaders(headers);

        expect(parsedUsage.promptTextTokens).toBe(
            originalUsage.promptTextTokens,
        );
        expect(parsedUsage.promptCachedTokens).toBe(
            originalUsage.promptCachedTokens,
        );
        expect(parsedUsage.promptAudioTokens).toBe(
            originalUsage.promptAudioTokens,
        );
        expect(parsedUsage.completionTextTokens).toBe(
            originalUsage.completionTextTokens,
        );
        expect(parsedUsage.completionReasoningTokens).toBe(
            originalUsage.completionReasoningTokens,
        );
        expect(parsedUsage.completionAudioSeconds).toBe(
            originalUsage.completionAudioSeconds,
        );
    });
});

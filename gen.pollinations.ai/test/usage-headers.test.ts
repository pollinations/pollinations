import type { Usage } from "@shared/registry/registry.ts";
import {
    buildUsageHeaders,
    openaiUsageToUsage,
    parseUsageHeaders,
} from "@shared/registry/usage-headers.ts";
import { describe, expect, it } from "vitest";

describe("buildUsageHeaders", () => {
    // Raw-string consumers (track.ts, text-cache.ts) read these exact wire keys
    // and values, so pin the literal key→String(value) mapping for every
    // single-field passthrough. One fully-populated Usage covers all of them.
    it("emits the literal wire key/value for each populated field", () => {
        const usage: Usage = {
            promptTextTokens: 42,
            completionTextTokens: 55,
            promptCachedTokens: 50,
            promptCacheWriteTokens: 4096,
            completionReasoningTokens: 150,
        };
        const headers = buildUsageHeaders("openai-fast", usage);

        const expected: Record<string, string> = {
            "x-model-used": "openai-fast",
            "x-usage-prompt-text-tokens": "42",
            "x-usage-completion-text-tokens": "55",
            "x-usage-prompt-cached-tokens": "50",
            "x-usage-prompt-cache-write-tokens": "4096",
            "x-usage-completion-reasoning-tokens": "150",
        };
        for (const [key, value] of Object.entries(expected)) {
            expect(headers[key]).toBe(value);
        }
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

    it("should handle Inception top-level cached and reasoning tokens", () => {
        const openaiUsage = {
            prompt_tokens: 8,
            reasoning_tokens: 49,
            completion_tokens: 4,
            total_tokens: 61,
            cached_input_tokens: 8,
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.promptTextTokens).toBe(0);
        expect(usage.promptCachedTokens).toBe(8);
        expect(usage.completionTextTokens).toBe(4);
        expect(usage.completionReasoningTokens).toBe(49);
    });

    it("should handle Anthropic cache creation tokens", () => {
        const openaiUsage = {
            prompt_tokens: 8596,
            completion_tokens: 8,
            total_tokens: 8604,
            prompt_tokens_details: {
                cached_tokens: 0,
            },
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 8584,
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.promptTextTokens).toBe(12);
        expect(usage.promptCacheWriteTokens).toBe(8584);
        expect(usage.promptCachedTokens).toBe(0);
        expect(usage.completionTextTokens).toBe(8);
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

    it("should handle image tokens in prompt_tokens_details", () => {
        const openaiUsage = {
            prompt_tokens: 15,
            completion_tokens: 1,
            total_tokens: 16,
            prompt_tokens_details: {
                audio_tokens: 0,
                cached_tokens: 0,
                image_tokens: 1,
                text_tokens: 14,
            },
            completion_tokens_details: {
                reasoning_tokens: 0,
            },
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.promptTextTokens).toBe(14);
        expect(usage.promptImageTokens).toBe(1);
        expect(usage.completionTextTokens).toBe(1);
    });

    // Grok via Azure reports reasoning as an additive counter:
    // total_tokens = prompt_tokens + completion_tokens + reasoning_tokens.
    it("handles additive reasoning convention when total_tokens proves it", () => {
        // Production shape from grok-large:
        // prompt=35, completion=64, reasoning=345, total=444.
        const openaiUsage = {
            prompt_tokens: 35,
            completion_tokens: 64,
            total_tokens: 444,
            completion_tokens_details: {
                reasoning_tokens: 345,
            },
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.completionTextTokens).toBe(64);
        expect(usage.completionReasoningTokens).toBe(345);
    });

    it("keeps additive reasoning when prompt detail has the same token count", () => {
        const openaiUsage = {
            prompt_tokens: 1000,
            completion_tokens: 500,
            total_tokens: 1733,
            prompt_tokens_details: {
                cached_tokens: 233,
            },
            completion_tokens_details: {
                reasoning_tokens: 233,
            },
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.promptTextTokens).toBe(767);
        expect(usage.promptCachedTokens).toBe(233);
        expect(usage.completionTextTokens).toBe(500);
        expect(usage.completionReasoningTokens).toBe(233);
    });

    it("keeps inclusive reasoning inside completion_tokens when total_tokens is prompt plus completion", () => {
        // Production shape from mistral-4 with reasoning enabled:
        // prompt=54, completion=256, reasoning=203, total=310.
        const openaiUsage = {
            prompt_tokens: 54,
            completion_tokens: 256,
            total_tokens: 310,
            completion_tokens_details: {
                reasoning_tokens: 203,
            },
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.completionTextTokens).toBe(53);
        expect(usage.completionReasoningTokens).toBe(203);
    });

    it("caps inclusive completion details when provider detail exceeds completion_tokens", () => {
        // Quarantined shape: completion=195, reasoning=204.
        // total=prompt+completion proves inclusive accounting, so do not bill
        // 195 visible tokens plus 204 reasoning tokens.
        const openaiUsage = {
            prompt_tokens: 711,
            completion_tokens: 195,
            total_tokens: 906,
            completion_tokens_details: {
                reasoning_tokens: 204,
            },
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.completionTextTokens).toBe(0);
        expect(usage.completionReasoningTokens).toBe(195);
    });

    it("caps inclusive prompt details when cached_tokens exceeds prompt_tokens", () => {
        // Quarantined shape: prompt=500, cached=1701.
        // total=prompt+completion proves inclusive accounting, so cap cached
        // to the prompt token budget instead of inventing negative text tokens.
        const openaiUsage = {
            prompt_tokens: 500,
            completion_tokens: 100,
            total_tokens: 600,
            prompt_tokens_details: {
                cached_tokens: 1701,
            },
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.promptTextTokens).toBe(0);
        expect(usage.promptCachedTokens).toBe(500);
    });

    it("handles additive prompt convention when total_tokens proves it", () => {
        const openaiUsage = {
            prompt_tokens: 500,
            completion_tokens: 100,
            total_tokens: 2301,
            prompt_tokens_details: {
                cached_tokens: 1701,
            },
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.promptTextTokens).toBe(500);
        expect(usage.promptCachedTokens).toBe(1701);
    });

    it("never produces negative token counts", () => {
        const openaiUsage = {
            prompt_tokens: 50,
            completion_tokens: 100,
            total_tokens: 150,
            prompt_tokens_details: {
                cached_tokens: 200,
                audio_tokens: 0,
                image_tokens: 0,
            },
            completion_tokens_details: {
                reasoning_tokens: 500,
                audio_tokens: 0,
            },
        };

        const usage = openaiUsageToUsage(openaiUsage);

        expect(usage.promptTextTokens).toBeGreaterThanOrEqual(0);
        expect(usage.completionTextTokens).toBeGreaterThanOrEqual(0);
        expect(usage.promptCachedTokens).toBe(50);
        expect(usage.completionReasoningTokens).toBe(100);
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
            "x-usage-prompt-cache-write-tokens": "4096",
        });

        const usage = parseUsageHeaders(headers);

        expect(usage.promptTextTokens).toBe(200);
        expect(usage.promptCachedTokens).toBe(100);
        expect(usage.promptCacheWriteTokens).toBe(4096);
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
            promptCacheWriteTokens: 4096,
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
        expect(parsedUsage.promptCacheWriteTokens).toBe(
            originalUsage.promptCacheWriteTokens,
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

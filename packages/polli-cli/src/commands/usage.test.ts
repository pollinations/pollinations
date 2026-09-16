import { describe, expect, it } from "vitest";
import {
    MAX_USAGE_DAYS,
    parseUsageDays,
    resolveKeyIds,
    tokensIn,
    tokensOut,
} from "./usage.js";

describe("parseUsageDays", () => {
    it("accepts a plain day count", () => {
        expect(parseUsageDays("7")).toBe(7);
    });

    it("rejects zero, negatives and non-integers", () => {
        expect(() => parseUsageDays("0")).toThrow(
            "--days must be a positive integer",
        );
        expect(() => parseUsageDays("-1")).toThrow(
            "--days must be a positive integer",
        );
        expect(() => parseUsageDays("2.5")).toThrow(
            "--days must be a positive integer",
        );
        expect(() => parseUsageDays("abc")).toThrow(
            "--days must be a positive integer",
        );
    });

    it("rejects windows beyond the API maximum", () => {
        expect(() => parseUsageDays(String(MAX_USAGE_DAYS + 1))).toThrow(
            `--days must be ${MAX_USAGE_DAYS} or less`,
        );
        expect(parseUsageDays(String(MAX_USAGE_DAYS))).toBe(MAX_USAGE_DAYS);
    });
});

describe("resolveKeyIds", () => {
    const keys = [
        { id: "key_abc123", name: "polli-harness-1" },
        { id: "key_def456", name: "polli-harness-2" },
    ];

    it("resolves a key name to its id", () => {
        expect(resolveKeyIds(["polli-harness-1"], keys)).toEqual({
            ids: ["key_abc123"],
        });
    });

    it("resolves a name case-insensitively", () => {
        expect(resolveKeyIds(["POLLI-HARNESS-1"], keys)).toEqual({
            ids: ["key_abc123"],
        });
    });

    it("passes a known id through unchanged", () => {
        expect(resolveKeyIds(["key_def456"], keys)).toEqual({
            ids: ["key_def456"],
        });
    });

    it("resolves multiple values", () => {
        expect(resolveKeyIds(["polli-harness-1", "key_def456"], keys)).toEqual({
            ids: ["key_abc123", "key_def456"],
        });
    });

    it("errors with near matches for an unknown name", () => {
        const result = resolveKeyIds(["polli-harness"], keys);
        expect("error" in result).toBe(true);
        if ("error" in result) {
            expect(result.error).toContain("polli-harness-1");
            expect(result.error).toContain("polli-harness-2");
        }
    });

    it("errors without suggestions when nothing is close", () => {
        expect(resolveKeyIds(["nope"], keys)).toEqual({
            error: 'Unknown key "nope".',
        });
    });
});

describe("tokensIn / tokensOut", () => {
    it("sums the input token fields", () => {
        expect(
            tokensIn({
                input_text_tokens: 10,
                input_cached_tokens: 2,
                input_audio_tokens: 0,
                input_image_tokens: 1,
            }),
        ).toBe(13);
    });

    it("sums the output token fields", () => {
        expect(
            tokensOut({
                output_text_tokens: 5,
                output_reasoning_tokens: 3,
                output_audio_tokens: 0,
                output_image_tokens: 1,
            }),
        ).toBe(9);
    });
});

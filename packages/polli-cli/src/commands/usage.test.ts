import { afterEach, describe, expect, it, vi } from "vitest";

import {
    isKeyId,
    parseUsageDays,
    resolveKeyIds,
    tokensIn,
    tokensOut,
} from "./usage.js";

const keys = [
    { id: "A1".repeat(16), name: "polli-harness-dsh" },
    { id: "B2".repeat(16), name: "polli-harness-openclaw" },
    { id: "C3".repeat(16), name: "my-app" },
];

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("isKeyId", () => {
    it("accepts a 32-char alphanumeric id", () => {
        expect(isKeyId("A1".repeat(16))).toBe(true);
        expect(isKeyId("0123456789abcdefGHIJKLMNOPQRSTUV")).toBe(true);
    });

    it("rejects names, short ids, and punctuation", () => {
        expect(isKeyId("polli-harness-dsh")).toBe(false);
        expect(isKeyId("A1".repeat(15))).toBe(false);
        expect(isKeyId(`${"A1".repeat(16)}!`)).toBe(false);
    });
});

describe("parseUsageDays", () => {
    it("accepts a plain day count", () => {
        expect(parseUsageDays("1")).toBe(1);
        expect(parseUsageDays("30")).toBe(30);
        expect(parseUsageDays("90")).toBe(90);
    });

    it("rejects zero, negatives and non-integers", () => {
        expect(() => parseUsageDays("0")).toThrow(
            "--days must be a positive integer",
        );
        expect(() => parseUsageDays("-5")).toThrow(
            "--days must be a positive integer",
        );
        expect(() => parseUsageDays("1.5")).toThrow(
            "--days must be a positive integer",
        );
        expect(() => parseUsageDays("abc")).toThrow(
            "--days must be a positive integer",
        );
    });

    it("rejects windows beyond the API maximum", () => {
        expect(() => parseUsageDays("91")).toThrow("--days must be 90 or less");
    });
});

describe("resolveKeyIds", () => {
    it("passes ids through without needing the key list", () => {
        expect(resolveKeyIds([keys[0].id], [])).toEqual([keys[0].id]);
    });

    it("resolves a name to its id (case-insensitive)", () => {
        expect(resolveKeyIds(["POLLI-HARNESS-DSH"], keys)).toEqual([
            keys[0].id,
        ]);
    });

    it("resolves mixed names and ids, preserving order", () => {
        expect(resolveKeyIds([keys[2].name, keys[1].id], keys)).toEqual([
            keys[2].id,
            keys[1].id,
        ]);
    });

    it("collects repeated values without duplicating work", () => {
        expect(
            resolveKeyIds(
                [keys[0].name, keys[1].name, keys[0].name, keys[2].id],
                keys,
            ),
        ).toEqual([keys[0].id, keys[1].id, keys[0].id, keys[2].id]);
    });

    it("errors on unknown names with near matches", () => {
        expect(() => resolveKeyIds(["polli-harness"], keys)).toThrow(
            'Unknown key name "polli-harness". Near matches: polli-harness-dsh, polli-harness-openclaw.',
        );
    });

    it("errors on unknown names with no suggestions when nothing is near", () => {
        expect(() => resolveKeyIds(["zzz"], keys)).toThrow(
            'Unknown key name "zzz".',
        );
    });

    it("errors listing ids when a name is ambiguous", () => {
        const dup = [
            { id: keys[0].id, name: "dup" },
            { id: keys[1].id, name: "dup" },
        ];
        expect(() => resolveKeyIds(["dup"], dup)).toThrow(
            `Ambiguous key name "dup" matches ids: ${keys[0].id}, ${keys[1].id}`,
        );
    });
});

describe("token totals matching the usage endpoint schema", () => {
    const row = {
        input_text_tokens: 10,
        input_cached_tokens: 3,
        input_audio_tokens: 2,
        input_image_tokens: 1,
        output_text_tokens: 20,
        output_reasoning_tokens: 4,
        output_audio_tokens: 0,
        output_image_tokens: 6,
    };

    it("sums all input token columns", () => {
        expect(tokensIn(row)).toBe(16);
    });

    it("sums all output token columns including reasoning", () => {
        expect(tokensOut(row)).toBe(30);
    });

    it("treats null or missing columns as zero", () => {
        expect(
            tokensIn({ input_text_tokens: 5, input_cached_tokens: null }),
        ).toBe(5);
        expect(tokensOut({ output_text_tokens: null })).toBe(0);
        expect(tokensIn({})).toBe(0);
    });
});

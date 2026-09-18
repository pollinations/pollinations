import { describe, expect, it } from "vitest";
import {
    matchKeyRef,
    nearKeyMatches,
    sumTokens,
    type UsageRecord,
} from "./usage.js";

const keys = [
    { id: "key_harness_1", name: "polli-harness-abc" },
    { id: "key_main", name: "main" },
];

const record = (overrides: Partial<UsageRecord> = {}): UsageRecord => ({
    timestamp: "2026-09-18 00:00:00",
    type: "generate.text",
    model: "openai",
    api_key: "polli-harness-abc",
    meter_source: "tier",
    input_text_tokens: 0,
    input_cached_tokens: 0,
    input_audio_tokens: 0,
    input_image_tokens: 0,
    output_text_tokens: 0,
    output_reasoning_tokens: 0,
    output_audio_tokens: 0,
    output_image_tokens: 0,
    cost_usd: 0,
    ...overrides,
});

describe("sumTokens", () => {
    it("sums input and output token columns, ignoring durations", () => {
        const tokens = sumTokens(
            record({
                input_text_tokens: 10,
                input_cached_tokens: 5,
                input_audio_tokens: 2,
                input_image_tokens: 1,
                output_text_tokens: 20,
                output_reasoning_tokens: 7,
                output_audio_tokens: 3,
                output_image_tokens: 4,
            }),
        );
        expect(tokens.in).toBe(18);
        expect(tokens.out).toBe(34);
    });
});

describe("matchKeyRef", () => {
    it("matches an exact key id", () => {
        expect(matchKeyRef(keys, "key_main")?.name).toBe("main");
    });

    it("matches a key name case-insensitively", () => {
        expect(matchKeyRef(keys, "POLLI-HARNESS-ABC")?.id).toBe(
            "key_harness_1",
        );
    });

    it("returns undefined for an unknown reference", () => {
        expect(matchKeyRef(keys, "nope")).toBeUndefined();
    });
});

describe("nearKeyMatches", () => {
    it("finds keys whose name contains the reference", () => {
        expect(nearKeyMatches(keys, "harness").map((k) => k.name)).toEqual([
            "polli-harness-abc",
        ]);
    });

    it("finds keys whose id starts with the reference", () => {
        expect(nearKeyMatches(keys, "key_m").map((k) => k.id)).toEqual([
            "key_main",
        ]);
    });

    it("returns no matches for an unrelated reference", () => {
        expect(nearKeyMatches(keys, "zzz")).toEqual([]);
    });
});

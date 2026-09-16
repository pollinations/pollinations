import { describe, expect, it } from "vitest";
import {
    nearMatches,
    resolveKeyIds,
    tokensIn,
    tokensOut,
    usageQuery,
} from "./usage.js";

const keys = [
    { id: "abc123", name: "Bambr-agent-key" },
    { id: "def456", name: "AI Homework Solver" },
];

describe("resolveKeyIds", () => {
    it("resolves exact names and ids, keeping order", () => {
        expect(resolveKeyIds(keys, ["Bambr-agent-key", "def456"])).toEqual({
            ids: ["abc123", "def456"],
            unknown: [],
        });
    });

    it("reports unknown queries without failing the rest", () => {
        expect(resolveKeyIds(keys, ["nope", "AI Homework Solver"])).toEqual({
            ids: ["def456"],
            unknown: ["nope"],
        });
    });
});

describe("nearMatches", () => {
    it("matches by name substring, case-insensitively", () => {
        expect(nearMatches(keys, "bambr").map((k) => k.name)).toEqual([
            "Bambr-agent-key",
        ]);
        expect(nearMatches(keys, "homework").map((k) => k.name)).toEqual([
            "AI Homework Solver",
        ]);
    });

    it("matches by id prefix", () => {
        expect(nearMatches(keys, "DE").map((k) => k.id)).toEqual(["def456"]);
    });

    it("returns nothing for unrelated queries", () => {
        expect(nearMatches(keys, "zzz")).toEqual([]);
    });
});

describe("tokensIn/tokensOut", () => {
    it("sums every input and output token column", () => {
        const row = {
            input_text_tokens: 10,
            input_cached_tokens: 5,
            input_audio_tokens: 0,
            input_image_tokens: 2,
            output_text_tokens: 7,
            output_reasoning_tokens: 3,
            output_audio_tokens: 0,
            output_image_tokens: 1,
        };
        expect(tokensIn(row)).toBe(17);
        expect(tokensOut(row)).toBe(11);
    });

    it("treats missing columns as zero", () => {
        expect(tokensIn({})).toBe(0);
        expect(tokensOut({})).toBe(0);
    });
});

describe("usageQuery", () => {
    it("omits empty filters", () => {
        expect(usageQuery({})).toBe("");
        expect(usageQuery({ limit: 5 })).toBe("limit=5");
    });

    it("joins repeated filters and adds format=csv", () => {
        expect(
            usageQuery({
                apiKeyIds: ["a", "b"],
                models: ["openai/gpt-5.4-nano"],
                days: 1,
                csv: true,
            }),
        ).toBe(
            "api_key_ids=a%2Cb&models=openai%2Fgpt-5.4-nano&days=1&format=csv",
        );
    });
});

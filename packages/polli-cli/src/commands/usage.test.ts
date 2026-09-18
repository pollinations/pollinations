import { describe, expect, it } from "vitest";
import {
    filterByModel,
    MAX_USAGE_DAYS,
    parseUsageDays,
    resolveKeyIds,
    splitKeyFlag,
    tokensIn,
    tokensOut,
    type UsageKeyInfo,
} from "./usage.js";

const keys: UsageKeyInfo[] = [
    { id: "id_kimi", name: "kimi" },
    { id: "id_kimi3", name: "kimi3" },
    { id: "id_harness", name: "polli-harness-claude" },
];

describe("parseUsageDays", () => {
    it("accepts a plain day count", () => {
        expect(parseUsageDays("1")).toBe(1);
        expect(parseUsageDays("30")).toBe(30);
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
        expect(parseUsageDays(String(MAX_USAGE_DAYS))).toBe(MAX_USAGE_DAYS);
        expect(() => parseUsageDays(String(MAX_USAGE_DAYS + 1))).toThrow(
            `--days must be ${MAX_USAGE_DAYS} or less`,
        );
    });
});

describe("resolveKeyIds", () => {
    it("resolves names through the key list", () => {
        expect(resolveKeyIds(keys, ["kimi"])).toEqual(["id_kimi"]);
    });

    it("passes ids through", () => {
        expect(resolveKeyIds(keys, ["id_harness"])).toEqual(["id_harness"]);
    });

    it("resolves mixed names and ids, preserving order", () => {
        expect(resolveKeyIds(keys, ["id_kimi3", "kimi"])).toEqual([
            "id_kimi3",
            "id_kimi",
        ]);
    });

    it("fails on unknown values with near matches", () => {
        expect(() => resolveKeyIds(keys, ["kim"])).toThrow(
            'Unknown key "kim". Near matches: kimi, kimi3',
        );
    });

    it("lists all key names when nothing is near", () => {
        expect(() => resolveKeyIds(keys, ["nope"])).toThrow(
            'Unknown key "nope". Available keys: kimi, kimi3, polli-harness-claude',
        );
    });
});

describe("tokensIn / tokensOut", () => {
    const record = {
        input_text_tokens: 10,
        input_cached_tokens: 2,
        input_audio_tokens: 1,
        input_image_tokens: 3,
        output_text_tokens: 20,
        output_reasoning_tokens: 4,
        output_audio_tokens: 0,
        output_image_tokens: 1,
    } as Parameters<typeof tokensIn>[0];

    it("sums the input token columns", () => {
        expect(tokensIn(record)).toBe(16);
    });

    it("sums the output token columns", () => {
        expect(tokensOut(record)).toBe(25);
    });
});

describe("filterByModel", () => {
    const rows = [
        { model: "flux", cost_usd: 1 },
        { model: "openai", cost_usd: 2 },
        { model: null, cost_usd: 3 },
    ];

    it("returns all rows when no model filter is given", () => {
        expect(filterByModel(rows, [])).toEqual(rows);
    });

    it("keeps only rows matching a requested model, dropping nulls", () => {
        expect(filterByModel(rows, ["flux"])).toEqual([rows[0]]);
    });
});

describe("splitKeyFlag", () => {
    it("treats --key before the subcommand as the auth override", () => {
        expect(
            splitKeyFlag(["node", "polli", "--key", "sk_abc", "usage"]),
        ).toEqual({ authKey: "sk_abc", filterKeys: [] });
    });

    it("treats --key after the subcommand as a repeatable filter", () => {
        expect(
            splitKeyFlag([
                "node",
                "polli",
                "usage",
                "--key",
                "kimi",
                "--key",
                "kimi3",
            ]),
        ).toEqual({ authKey: undefined, filterKeys: ["kimi", "kimi3"] });
    });

    it("resolves both independently when present on both sides", () => {
        expect(
            splitKeyFlag([
                "node",
                "polli",
                "--key",
                "sk_abc",
                "usage",
                "--key",
                "kimi",
            ]),
        ).toEqual({ authKey: "sk_abc", filterKeys: ["kimi"] });
    });

    it("supports --key=value syntax on both sides", () => {
        expect(
            splitKeyFlag([
                "node",
                "polli",
                "--key=sk_abc",
                "usage",
                "--key=kimi",
            ]),
        ).toEqual({ authKey: "sk_abc", filterKeys: ["kimi"] });
    });

    it("keeps only the last pre-subcommand value for auth", () => {
        expect(
            splitKeyFlag([
                "node",
                "polli",
                "--key",
                "sk_first",
                "--key",
                "sk_second",
                "usage",
            ]),
        ).toEqual({ authKey: "sk_second", filterKeys: [] });
    });
});

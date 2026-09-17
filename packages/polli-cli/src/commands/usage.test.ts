import { describe, expect, it } from "vitest";
import {
    filterDailyRows,
    MAX_USAGE_DAYS,
    parseUsageDays,
    resolveKeyIds,
    splitKeyArgs,
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

describe("splitKeyArgs", () => {
    it("treats --key after the subcommand as a filter", () => {
        expect(
            splitKeyArgs(["node", "polli", "usage", "--key", "kimi"]),
        ).toEqual({ authKey: undefined, filterKeys: ["kimi"] });
    });

    it("keeps --key before the subcommand as the auth override", () => {
        expect(
            splitKeyArgs(["node", "polli", "--key", "sk_real", "usage"]),
        ).toEqual({ authKey: "sk_real", filterKeys: [] });
    });

    it("supports both positions at once", () => {
        expect(
            splitKeyArgs([
                "node",
                "polli",
                "--key",
                "sk_real",
                "usage",
                "--key",
                "kimi",
            ]),
        ).toEqual({ authKey: "sk_real", filterKeys: ["kimi"] });
    });

    it("collects repeated filters and --key=value form", () => {
        expect(
            splitKeyArgs([
                "node",
                "polli",
                "usage",
                "--key",
                "kimi",
                "--key=kimi3",
            ]),
        ).toEqual({ authKey: undefined, filterKeys: ["kimi", "kimi3"] });
    });

    it("keeps the historical auth meaning for post-subcommand secrets", () => {
        expect(
            splitKeyArgs(["node", "polli", "usage", "--key", "sk_secret"]),
        ).toEqual({ authKey: "sk_secret", filterKeys: [] });
    });

    it("returns no keys when --key is absent", () => {
        expect(splitKeyArgs(["node", "polli", "usage", "--daily"])).toEqual({
            authKey: undefined,
            filterKeys: [],
        });
    });
});

describe("filterDailyRows", () => {
    const rows = [
        {
            date: "2026-09-16",
            model: "openai",
            api_key: "kimi",
            api_key_id: "id_kimi",
            meter_source: "tier",
            requests: 2,
            cost_usd: 0.1,
        },
        {
            date: "2026-09-16",
            model: "muse",
            api_key: "kimi3",
            api_key_id: "id_kimi3",
            meter_source: "tier",
            requests: 1,
            cost_usd: 0.2,
        },
        {
            date: "2026-09-15",
            model: "openai",
            api_key: "kimi3",
            api_key_id: "id_kimi3",
            meter_source: "pack",
            requests: 3,
            cost_usd: 0.3,
        },
    ];

    it("returns all rows without filters", () => {
        expect(filterDailyRows(rows, [], [])).toHaveLength(3);
    });

    it("filters by key id, not name", () => {
        const out = filterDailyRows(rows, ["id_kimi3"], []);
        expect(out.map((r) => r.api_key_id)).toEqual(["id_kimi3", "id_kimi3"]);
    });

    it("filters by model and combines both filters", () => {
        expect(filterDailyRows(rows, [], ["openai"])).toHaveLength(2);
        expect(filterDailyRows(rows, ["id_kimi3"], ["openai"])).toHaveLength(1);
    });

    it("drops rows with a null api_key_id when key filters are set", () => {
        const withNull = [{ ...rows[0], api_key_id: null }];
        expect(filterDailyRows(withNull, ["id_kimi"], [])).toHaveLength(0);
    });
});

describe("token totals", () => {
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

    it("treats missing or null columns as zero", () => {
        expect(tokensIn({ input_text_tokens: 5 })).toBe(5);
        expect(tokensOut({ output_text_tokens: null })).toBe(0);
        expect(tokensIn({})).toBe(0);
    });
});

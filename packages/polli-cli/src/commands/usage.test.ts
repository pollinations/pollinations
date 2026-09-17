import { describe, expect, it } from "vitest";
import {
    buildUsageQuery,
    collectList,
    type DailyUsageRecord,
    filterDailyRows,
    type KeyRef,
    looksLikeKeyId,
    resolveKeyArgs,
    splitKeyArgs,
    suggestKeys,
    tokenCounts,
    type UsageRecord,
} from "./usage.js";

const keys: KeyRef[] = [
    { id: "11111111-1111-1111-1111-111111111111", name: "polli-harness-dsh" },
    {
        id: "22222222-2222-2222-2222-222222222222",
        name: "polli-harness-claude",
    },
    { id: "33333333-3333-3333-3333-333333333333", name: "my-bot" },
];

describe("collectList", () => {
    it("accumulates repeatable flags in flag order", () => {
        expect(collectList("a", ["b"])).toEqual(["b", "a"]);
        expect(collectList("a")).toEqual(["a"]);
    });

    it("splits comma-separated values and trims", () => {
        expect(collectList(" a , b ,, c ")).toEqual(["a", "b", "c"]);
    });
});

describe("splitKeyArgs", () => {
    it("treats a --key before the subcommand as the global auth override", () => {
        expect(
            splitKeyArgs([
                "node",
                "polli",
                "--key",
                "sk_new",
                "usage",
                "--history",
            ]),
        ).toEqual({ authKey: "sk_new", filterKeys: [] });
    });

    it("treats a --key after the subcommand as a key filter", () => {
        expect(
            splitKeyArgs([
                "node",
                "polli",
                "usage",
                "--history",
                "--key",
                "polli-harness-dsh",
                "--key",
                "my-bot",
            ]),
        ).toEqual({
            authKey: undefined,
            filterKeys: ["polli-harness-dsh", "my-bot"],
        });
    });

    it("keeps a post-subcommand secret key as the auth override", () => {
        expect(
            splitKeyArgs([
                "node",
                "polli",
                "usage",
                "--history",
                "--key",
                "sk_abc123",
            ]),
        ).toEqual({ authKey: "sk_abc123", filterKeys: [] });
    });

    it("accepts --key=value and comma-separated lists", () => {
        expect(
            splitKeyArgs([
                "node",
                "polli",
                "usage",
                "--history",
                "--key=polli-harness-dsh,my-bot",
            ]),
        ).toEqual({
            authKey: undefined,
            filterKeys: ["polli-harness-dsh", "my-bot"],
        });
    });

    it("lets a later auth override win and mixes auth with filters", () => {
        expect(
            splitKeyArgs([
                "node",
                "polli",
                "--key",
                "sk_old",
                "--key",
                "sk_new",
                "usage",
                "--history",
                "--key",
                "my-bot",
            ]),
        ).toEqual({ authKey: "sk_new", filterKeys: ["my-bot"] });
    });

    it("ignores a trailing --key with no value", () => {
        expect(
            splitKeyArgs(["node", "polli", "usage", "--history", "--key"]),
        ).toEqual({ authKey: undefined, filterKeys: [] });
    });
});

describe("resolveKeyArgs", () => {
    it("resolves names case-insensitively and ids pass through", () => {
        expect(
            resolveKeyArgs(
                ["POLLI-HARNESS-DSH", "33333333-3333-3333-3333-333333333333"],
                keys,
            ),
        ).toEqual({
            ids: [
                "11111111-1111-1111-1111-111111111111",
                "33333333-3333-3333-3333-333333333333",
            ],
            unknown: [],
        });
    });

    it("passes through an unknown id-like value and reports unknown names", () => {
        const res = resolveKeyArgs(
            ["44444444-4444-4444-4444-444444444444", "harness-dsw"],
            keys,
        );
        expect(res.ids).toEqual(["44444444-4444-4444-4444-444444444444"]);
        expect(res.unknown).toEqual(["harness-dsw"]);
    });

    it("deduplicates repeated keys", () => {
        expect(resolveKeyArgs(["my-bot", "my-bot"], keys).ids).toEqual([
            "33333333-3333-3333-3333-333333333333",
        ]);
    });
});

describe("looksLikeKeyId / suggestKeys", () => {
    it("recognizes uuid ids", () => {
        expect(looksLikeKeyId("11111111-1111-1111-1111-111111111111")).toBe(
            true,
        );
        expect(looksLikeKeyId("polli-harness-dsh")).toBe(false);
    });

    it("suggests near matches instead of an empty table", () => {
        expect(suggestKeys("dsh", keys)).toEqual(["polli-harness-dsh"]);
        expect(suggestKeys("polli-harness-dsh", keys)).toContain(
            "polli-harness-dsh",
        );
        expect(suggestKeys("nothing-like-this", keys)).toEqual([]);
    });
});

describe("tokenCounts", () => {
    it("sums input and output tokens across modalities", () => {
        const record = {
            timestamp: "2026-09-16 10:00:00",
            type: "generate.text",
            model: "openai",
            input_text_tokens: 10,
            input_cached_tokens: 5,
            input_image_tokens: 1,
            output_text_tokens: 20,
            output_reasoning_tokens: 7,
            cost_usd: 0.001,
            meter_source: "tier",
        } as UsageRecord;
        expect(tokenCounts(record)).toEqual({ in: 16, out: 27 });
    });

    it("treats missing token columns as zero", () => {
        const record = {
            timestamp: "2026-09-16 10:00:00",
            type: "generate.image",
            model: "flux",
            cost_usd: 0,
            meter_source: "tier",
        } as UsageRecord;
        expect(tokenCounts(record)).toEqual({ in: 0, out: 0 });
    });
});

describe("buildUsageQuery", () => {
    it("passes key ids and models to the history endpoint", () => {
        expect(
            buildUsageQuery({
                view: "history",
                limit: 20,
                days: 1,
                keyIds: ["a"],
                models: ["openai", "mistral"],
            }),
        ).toBe(
            "/account/usage?limit=20&days=1&api_key_ids=a&models=openai%2Cmistral",
        );
    });

    it("sends only days to the daily endpoint (filters are client-side)", () => {
        expect(
            buildUsageQuery({
                view: "daily",
                days: 7,
                keyIds: ["a", "b"],
                models: ["openai"],
            }),
        ).toBe("/account/usage/daily?days=7");
    });

    it("requests the raw csv export", () => {
        expect(buildUsageQuery({ view: "history", limit: 50, csv: true })).toBe(
            "/account/usage?limit=50&format=csv",
        );
    });

    it("keeps the default limit for history when none is given", () => {
        expect(buildUsageQuery({ view: "history" })).toBe(
            "/account/usage?limit=20",
        );
    });
});

describe("filterDailyRows", () => {
    const rows: DailyUsageRecord[] = [
        {
            date: "2026-09-17",
            model: "openai/gpt-5.4-nano",
            api_key_id: "aaaaaaaa-1111-1111-1111-111111111111",
            meter_source: "tier",
            requests: 3,
            cost_usd: 0.01,
        },
        {
            date: "2026-09-17",
            model: "deepseek/deepseek-v4.1-flash",
            api_key_id: "bbbbbbbb-2222-2222-2222-222222222222",
            meter_source: "tier",
            requests: 1,
            cost_usd: 0.02,
        },
        {
            date: "2026-09-16",
            model: null,
            api_key_id: null,
            meter_source: "tier",
            requests: 1,
            cost_usd: 0.0,
        },
    ];

    it("returns every row when nothing is filtered", () => {
        expect(filterDailyRows(rows)).toHaveLength(3);
    });

    it("filters by model", () => {
        expect(
            filterDailyRows(rows, [], ["openai/gpt-5.4-nano"]).map(
                (r) => r.model,
            ),
        ).toEqual(["openai/gpt-5.4-nano"]);
    });

    it("filters by key id and drops rows without one", () => {
        expect(
            filterDailyRows(rows, ["bbbbbbbb-2222-2222-2222-222222222222"]).map(
                (r) => r.model,
            ),
        ).toEqual(["deepseek/deepseek-v4.1-flash"]);
    });

    it("applies key and model filters together", () => {
        expect(
            filterDailyRows(
                rows,
                ["bbbbbbbb-2222-2222-2222-222222222222"],
                ["openai/gpt-5.4-nano"],
            ),
        ).toEqual([]);
    });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../lib/config.js";
import { setOutputMode } from "../lib/output.js";
import {
    filterDailyRows,
    isKeyId,
    resolveKeyIds,
    splitKeyArgs,
    tokensIn,
    tokensOut,
    type UsageKeyInfo,
    usageCommand,
} from "./usage.js";

const keys: UsageKeyInfo[] = [
    { id: "id_kimi", name: "kimi" },
    { id: "id_kimi3", name: "kimi3" },
    { id: "id_harness", name: "polli-harness-claude" },
];

describe("isKeyId", () => {
    it("accepts 32-char alphanumerics", () => {
        expect(isKeyId("lIa3Q9Wdq2jAw1mkdI38g5zpsaZr45qz")).toBe(true);
        expect(isKeyId("a".repeat(32))).toBe(true);
    });

    it("rejects names and other lengths", () => {
        expect(isKeyId("polli-harness-claude")).toBe(false);
        expect(isKeyId("kimi")).toBe(false);
        expect(isKeyId("a".repeat(31))).toBe(false);
        expect(isKeyId("a".repeat(33))).toBe(false);
        expect(isKeyId(`${"a".repeat(31)}-`)).toBe(false);
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
        input_cache_write_tokens: 7,
        input_audio_tokens: 2,
        input_image_tokens: 1,
        output_text_tokens: 20,
        output_reasoning_tokens: 4,
        output_audio_tokens: 0,
        output_image_tokens: 6,
    };

    it("sums all input token columns, including cache writes", () => {
        expect(tokensIn(row)).toBe(23);
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

describe("usage command output", () => {
    const originalArgv = process.argv;
    const record = {
        timestamp: "2026-10-01T00:00:00Z",
        type: "generate.text",
        model: "openai",
        api_key: "kimi",
        api_key_id: "id_kimi",
        input_text_tokens: 12,
        input_audio_tokens: 3,
        output_reasoning_tokens: 7,
        cost_usd: 0.00003,
        meter_source: "tier",
    };
    const daily = {
        date: "2026-10-01",
        model: "openai",
        api_key: "kimi",
        api_key_id: "id_kimi",
        meter_source: "tier",
        requests: 1,
        cost_usd: 0.00003,
    };
    const dailyRows = [daily, { ...daily, model: "muse", cost_usd: 0.5 }];

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        setKeyOverride(undefined);
        setOutputMode("human");
        process.argv = originalArgv;
    });

    let urls: string[] = [];
    // An unbudgeted key sees the wallet total in both fields.
    let balanceBody: object = {
        balance: 0.123456,
        accountBalance: { total: 0.123456 },
    };

    async function run(args: string[], mode: "human" | "json" = "json") {
        urls = [];
        process.argv = ["node", "polli", "--key", "sk_test", "usage", ...args];
        setOutputMode(mode);
        const writes: string[] = [];
        vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
            writes.push(String(chunk));
            return true;
        });
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        vi.stubGlobal("fetch", async (url: string) => {
            urls.push(url);
            if (url.includes("format=csv")) return new Response("a,b\n1,2\n");
            if (url.includes("/account/usage/daily"))
                return Response.json({ usage: dailyRows, count: 2 });
            if (url.includes("/account/usage"))
                return Response.json({ usage: [record], count: 1 });
            return Response.json(balanceBody);
        });
        await usageCommand.parseAsync(args, { from: "user" });
        return writes.join("");
    }

    it("prints raw history records with numeric cost in JSON mode", async () => {
        expect(JSON.parse(await run(["--history"]))).toEqual([record]);
    });

    it("prints filtered daily records with numeric cost in JSON mode", async () => {
        const out = await run(["--daily", "--model", "openai"]);
        expect(JSON.parse(out)).toEqual([daily]);
    });

    it("asks for a week of daily usage unless --days is given", async () => {
        await run(["--daily"]);
        expect(urls[0]).toContain("/account/usage/daily?days=7");
        await run(["--daily", "--days", "30"]);
        expect(urls[0]).toContain("/account/usage/daily?days=30");
    });

    it("keeps the rounded human table and raw CSV/balance output", async () => {
        expect(await run(["--history"], "human")).toContain("$0.0000");
        expect(await run(["--history", "--csv"])).toBe("a,b\n1,2\n");
        expect(JSON.parse(await run([]))).toEqual({ pollen: 0.123456 });
    });

    it("shows the wallet, not a budgeted key's remaining budget, as pollen", async () => {
        balanceBody = { balance: 4.5, accountBalance: { total: 0 } };
        expect(JSON.parse(await run([]))).toEqual({
            pollen: 0,
            key_budget: 4.5,
        });
    });
});

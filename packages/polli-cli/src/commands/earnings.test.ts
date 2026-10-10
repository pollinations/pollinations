import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../lib/config.js";
import { ExitSignal, setOutputMode } from "../lib/output.js";
import {
    type EarningsRow,
    earningsCommand,
    totalPollenEarned,
} from "./earnings.js";

const row = (overrides: Partial<EarningsRow> = {}): EarningsRow => ({
    date: "",
    entity_id: "app_1",
    entity_name: "My App",
    source: "byop_markup",
    requests: 10,
    baseline_price: 0.5,
    pollen_earned: 0.1,
    paid_earned: 0.08,
    tier_earned: 0.02,
    cost_usd: 0.5,
    reward_rate: 0.2,
    ...overrides,
});

describe("totalPollenEarned", () => {
    it("sums pollen across entities", () => {
        const perEntity = [
            row({ pollen_earned: 0.1 }),
            row({ pollen_earned: 2.5 }),
        ];
        expect(totalPollenEarned(perEntity)).toBeCloseTo(2.6);
    });

    it("returns 0 for an empty rollup", () => {
        expect(totalPollenEarned([])).toBe(0);
    });
});

describe("earnings command --days", () => {
    let urls: string[] = [];

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        setKeyOverride(undefined);
        setOutputMode("human");
    });

    async function run(args: string[]) {
        urls = [];
        setKeyOverride("sk_test");
        setOutputMode("json");
        vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        vi.stubGlobal("fetch", async (url: string) => {
            urls.push(url);
            return Response.json({ daily: [], perEntity: [] });
        });
        await earningsCommand.parseAsync(args, { from: "user" });
    }

    it.each([
        "abc",
        "0",
        "-5",
        "1.5",
        "366",
        "999999",
        "",
    ])("rejects --days %j before fetching", async (value) => {
        await expect(run(["--days", value])).rejects.toThrow(ExitSignal);
        expect(urls).toEqual([]);
        expect(vi.mocked(process.stderr.write).mock.calls).toEqual([
            [
                expect.stringContaining(
                    "--days must be an integer between 1 and 365",
                ),
            ],
        ]);
    });

    it("sends the default and valid --days values", async () => {
        await run([]);
        expect(urls[0]).toContain("/account/earnings?days=30");
        await run(["--days", "365"]);
        expect(urls[0]).toContain("/account/earnings?days=365");
    });
});

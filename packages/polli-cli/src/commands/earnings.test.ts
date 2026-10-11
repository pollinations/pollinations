import { afterEach, describe, expect, it, vi } from "vitest";
import { type EarningsRow, totalPollenEarned } from "./earnings.js";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

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

describe("earningsCommand --days validation", () => {
    it("requests valid days parameter", async () => {
        const { setKeyOverride } = await import("../lib/config.js");
        setKeyOverride("sk_test");
        const fetch = vi.fn(async () =>
            Response.json({
                daily: [],
                perEntity: [],
            }),
        );
        vi.stubGlobal("fetch", fetch);
        const { earningsCommand } = await import("./earnings.js");

        await earningsCommand.parseAsync(["--days", "14"], { from: "user" });
        expect(fetch).toHaveBeenCalledOnce();
        const calledUrl = fetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain("/account/earnings?days=14");
    });

    it.each([
        "0",
        "-1",
        "abc",
        "1.5",
        "366",
    ])("rejects invalid days value %s", async (invalidDays) => {
        const { setKeyOverride } = await import("../lib/config.js");
        setKeyOverride("sk_test");
        const { earningsCommand } = await import("./earnings.js");

        await expect(
            earningsCommand.parseAsync(["--days", invalidDays], {
                from: "user",
            }),
        ).rejects.toThrow();
    });
});

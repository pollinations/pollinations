import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../lib/config.js";
import { ExitSignal, setOutputMode } from "../lib/output.js";
import {
    type EarningsRow,
    earningsCommand,
    MAX_EARNINGS_DAYS,
    parseDaysWindow,
    totalPollenEarned,
} from "./earnings.js";
import { usageCommand } from "./usage.js";

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

describe("parseDaysWindow", () => {
    it.each([1, 30, 90, 91, 180, 365])("accepts %i days", (days) => {
        expect(parseDaysWindow(String(days))).toBe(days);
    });

    it("rejects zero, negatives and non-integers", () => {
        expect(() => parseDaysWindow("0")).toThrow(
            "--days must be a positive integer",
        );
        expect(() => parseDaysWindow("-5")).toThrow(
            "--days must be a positive integer",
        );
        expect(() => parseDaysWindow("1.5")).toThrow(
            "--days must be a positive integer",
        );
        expect(() => parseDaysWindow("abc")).toThrow(
            "--days must be a positive integer",
        );
    });

    it("rejects windows beyond the API maximum", () => {
        expect(MAX_EARNINGS_DAYS).toBe(365);
        expect(() => parseDaysWindow("366")).toThrow(
            "--days must be 365 or less",
        );
        expect(parseDaysWindow(String(MAX_EARNINGS_DAYS))).toBe(
            MAX_EARNINGS_DAYS,
        );
    });
});

describe("earnings and usage command windows", () => {
    const originalArgv = process.argv;

    beforeEach(() => {
        setKeyOverride("sk_test");
        setOutputMode("json");
        vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({ daily: [], perEntity: [], usage: [] }),
            ),
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        setKeyOverride(undefined);
        setOutputMode("human");
        process.argv = originalArgv;
    });

    it.each([
        180, 365,
    ])("earnings dispatches a %i-day request", async (days) => {
        await earningsCommand.parseAsync(["--days", String(days)], {
            from: "user",
        });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining(`/account/earnings?days=${days}`),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: "Bearer sk_test",
                }),
            }),
        );
    });

    it.each([
        "0",
        "1.5",
        "366",
    ])("earnings rejects %s before fetching", async (days) => {
        await expect(
            earningsCommand.parseAsync(["--days", days], { from: "user" }),
        ).rejects.toThrow(ExitSignal);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("usage still accepts 90 days and rejects 91 before fetching", async () => {
        process.argv = [
            "node",
            "polli",
            "--key",
            "sk_test",
            "usage",
            "--history",
            "--days",
            "91",
        ];
        await usageCommand.parseAsync(["--history", "--days", "90"], {
            from: "user",
        });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining("/account/usage?days=90&limit=20"),
            expect.anything(),
        );
        vi.mocked(fetch).mockClear();
        await expect(
            usageCommand.parseAsync(["--history", "--days", "91"], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);
        expect(process.stderr.write).toHaveBeenCalledWith(
            expect.stringContaining("--days must be 90 or less"),
        );
        expect(fetch).not.toHaveBeenCalled();
    });
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

import { describe, expect, it } from "vitest";
import { fastModelsByTime, formatRunCost, formatRunTime } from "./run-stats";

describe("model stat badges", () => {
    it("shows dollars to two significant digits", () => {
        expect(formatRunCost(0.004)).toBe("$0.004");
        expect(formatRunCost(0.0473)).toBe("$0.047");
        expect(formatRunCost(0.4199)).toBe("$0.42");
        expect(formatRunCost(1.2)).toBe("$1.2");
    });

    it("rounds response times to whole seconds", () => {
        expect(formatRunTime(100)).toBe("1s");
        expect(formatRunTime(3000)).toBe("3s");
        expect(formatRunTime(41400)).toBe("41s");
    });

    it("drops zero seconds from whole minutes", () => {
        expect(formatRunTime(59999)).toBe("1m");
        expect(formatRunTime(100000)).toBe("1m 40s");
        expect(formatRunTime(120000)).toBe("2m");
        expect(formatRunTime(121000)).toBe("2m 1s");
    });

    it("omits unavailable measurements", () => {
        for (const value of [undefined, null, 0]) {
            expect(formatRunCost(value)).toBeUndefined();
            expect(formatRunTime(value)).toBeUndefined();
        }
    });
});

describe("Fast model filter", () => {
    const rank = (...times: (number | null)[]) => [
        ...fastModelsByTime(
            times.map((avg_response_ms, index) => ({
                model: String(index),
                avg_response_ms,
            })),
        ),
    ];

    it("hides the filter for sparse or closely grouped measurements", () => {
        expect(rank(null, 0, 1, 100, 200)).toEqual([]);
        expect(rank(95, 96, 97, 98)).toEqual([]);
    });

    it("includes ties at the cutoff and excludes missing times", () => {
        expect(rank(null, 1, 1, 4, 5, 8, 10, 11, 14)).toEqual(["1", "2"]);
    });
});

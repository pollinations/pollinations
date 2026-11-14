import { describe, expect, it } from "vitest";
import {
    isModelReliable,
    MIN_RELIABILITY_REQUESTS,
    modelHealthLookup,
} from "./model-health.ts";

describe("isModelReliable", () => {
    it("fails open when there are no recent observations (null or undefined)", () => {
        expect(isModelReliable(null)).toBe(true);
        expect(isModelReliable(undefined)).toBe(true);
        expect(isModelReliable(null, 0)).toBe(true);
        expect(isModelReliable(null, 10)).toBe(true);
    });

    it("treats models with fewer than MIN_RELIABILITY_REQUESTS as reliable even after failures", () => {
        expect(MIN_RELIABILITY_REQUESTS).toBe(5);

        // 1 request, 1 failure (0% success rate)
        expect(isModelReliable(0, 1)).toBe(true);

        // 3 requests, 1 failure (66.7% success rate)
        expect(isModelReliable(66.67, 3)).toBe(true);

        // 4 requests, 2 failures (50% success rate)
        expect(isModelReliable(50, 4)).toBe(true);

        // 4 requests, 4 failures (0% success rate)
        expect(isModelReliable(0, 4)).toBe(true);
    });

    it("applies the >80% success rate cutoff once the sample size reaches MIN_RELIABILITY_REQUESTS", () => {
        // Exactly 5 requests
        expect(isModelReliable(80, 5)).toBe(false);
        expect(isModelReliable(80.1, 5)).toBe(true);
        expect(isModelReliable(100, 5)).toBe(true);

        // 10 requests: 8 successes / 2 failures (80% success rate)
        expect(isModelReliable(80, 10)).toBe(false);

        // 10 requests: 9 successes / 1 failure (90% success rate)
        expect(isModelReliable(90, 10)).toBe(true);

        // 50 requests: 40 successes / 10 failures (80% success rate)
        expect(isModelReliable(80, 50)).toBe(false);

        // 50 requests: 41 successes / 9 failures (82% success rate)
        expect(isModelReliable(82, 50)).toBe(true);
    });

    it("preserves backwards compatibility when requests parameter is omitted", () => {
        expect(isModelReliable(80)).toBe(false);
        expect(isModelReliable(80.1)).toBe(true);
        expect(isModelReliable(79)).toBe(false);
        expect(isModelReliable(100)).toBe(true);
    });
});

describe("modelHealthLookup", () => {
    it("computes health status, requests, and successRate from rollup rows", () => {
        const lookup = modelHealthLookup([
            {
                model: "community/Saauf/test",
                event_type: "generate.text",
                is_rollup: 1,
                status_2xx: 4,
                errors_5xx: 1,
            },
        ]);

        const health = lookup("community/Saauf/test", "text");
        expect(health.requests).toBe(5);
        expect(health.successRate).toBe(80);
        expect(health.status).toBe("down"); // 1/5 = 20% errors >= DOWN_5XX_PERCENT
    });

    it("returns unknown for unobserved models", () => {
        const lookup = modelHealthLookup([]);
        const health = lookup("community/unknown/model", "text");
        expect(health.requests).toBe(0);
        expect(health.successRate).toBeNull();
        expect(health.status).toBe("unknown");
    });
});

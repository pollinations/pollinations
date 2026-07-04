import { describe, expect, it } from "vitest";
import { aggregateMeterRows } from "./MeterTab";

describe("aggregateMeterRows", () => {
    it("uses manual rows as replacements for the same provider month bucket", () => {
        expect(
            aggregateMeterRows([
                {
                    month: "2026-06",
                    provider: "aws",
                    cost_usd: 1990,
                    funding: "prepaid",
                    source: "api",
                },
                {
                    month: "2026-06",
                    provider: "aws",
                    cost_usd: 2010,
                    funding: "prepaid",
                    source: "manual",
                },
            ]),
        ).toEqual([
            {
                month: "2026-06",
                provider: "aws",
                creditUsage: 0,
                prepaidUsage: 2010,
                creditSource: "",
                prepaidSource: "manual",
            },
        ]);
    });
});

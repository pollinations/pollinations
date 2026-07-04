import { describe, expect, it } from "vitest";
import { normalizeMeterMonthly } from "./tb";

describe("normalizeMeterMonthly", () => {
    it("pivots raw funding rows into cash and credit burn columns", () => {
        expect(
            normalizeMeterMonthly([
                {
                    month: "2026-01",
                    provider: "aws",
                    cost_usd: 10,
                    funding: "cash",
                    source: "cli",
                },
                {
                    month: "2026-01",
                    provider: "aws",
                    cost_usd: 4,
                    funding: "prepaid",
                    source: "cli",
                },
                {
                    month: "2026-01",
                    provider: "aws",
                    cost_usd: 2.5,
                    funding: "credit",
                    source: "manual",
                },
            ]),
        ).toEqual([
            {
                month: "2026-01",
                provider: "aws",
                cash_burn_usd: 14,
                cash_src: "cli",
                credit_burn_usd: 2.5,
                credit_src: "manual",
            },
        ]);
    });

    it("keeps already-pivoted rows readable", () => {
        expect(
            normalizeMeterMonthly([
                {
                    month: "2026-02",
                    provider: "google",
                    cash_burn_usd: 12,
                    cash_src: "bq",
                    credit_burn_usd: 0,
                    credit_src: "",
                },
            ]),
        ).toEqual([
            {
                month: "2026-02",
                provider: "google",
                cash_burn_usd: 12,
                cash_src: "bq",
                credit_burn_usd: 0,
                credit_src: "",
            },
        ]);
    });
});

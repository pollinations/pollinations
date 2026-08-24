import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Data } from "../types";
import {
    forecastMethodHint,
    forecastMethodLabel,
    RunwayTab,
    runwayText,
    runwayValueClass,
} from "./RunwayTab";

describe("RunwayTab labels", () => {
    it("marks a runway that extends beyond the authored horizon", () => {
        expect(runwayText(6, true)).toBe("6+ months");
        expect(runwayText(1, false)).toBe("1 month");
        expect(runwayText(null, false)).toBe("–");
    });

    it("uses plain labels for the forecast methods", () => {
        expect(forecastMethodLabel("fixed")).toBe("FIXED");
        expect(forecastMethodLabel("funded")).toBe("FUNDED");
        expect(forecastMethodLabel("last")).toBe("LAST MONTH");
        expect(forecastMethodLabel("one_off")).toBe("ONE-OFF");
        expect(forecastMethodLabel(null)).toBeNull();
    });

    it("explains forecast methods on vendor hover", () => {
        expect(forecastMethodHint("fixed")).toBe(
            "Uses a fixed monthly amount.",
        );
        expect(forecastMethodHint("funded")).toBe("Covered by vendor credits.");
        expect(forecastMethodHint("last")).toBe(
            "Repeats the latest closed month.",
        );
        expect(forecastMethodHint("one_off")).toBe(
            "Included only in this month.",
        );
        expect(forecastMethodHint(null)).toBeNull();
    });

    it("colors cash values without overemphasizing zeroes", () => {
        expect(runwayValueClass(10)).toBe("text-outcome-positive-text");
        expect(runwayValueClass(-10)).toBe("text-outcome-negative-text");
        expect(runwayValueClass(0)).toBe("text-theme-text-soft");
        expect(runwayValueClass(null)).toBe("text-theme-text-soft");
    });

    it("shows category totals while vendor detail starts collapsed", () => {
        const data: Data = {
            opTransactions: [
                {
                    entry_id: "opening",
                    kind: "opening_balance",
                    source: "wise",
                    date: "2026-01-01",
                    vendor: "wise",
                    category: "balance_sheet",
                    amount: 1_000,
                    currency: "USD",
                    description: "Opening balance",
                    evidence: "Statement",
                    recorded_at: "2026-07-02 00:00:00",
                },
                {
                    entry_id: "revenue",
                    kind: "transaction",
                    source: "wise",
                    date: "2026-07-01",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 100,
                    currency: "USD",
                    description: "Revenue",
                    evidence: "",
                    recorded_at: "2026-07-02 00:00:00",
                },
                {
                    entry_id: "expense",
                    kind: "transaction",
                    source: "wise",
                    date: "2026-07-02",
                    vendor: "aws",
                    category: "compute",
                    amount: -40,
                    currency: "USD",
                    description: "Compute",
                    evidence: "",
                    recorded_at: "2026-07-03 00:00:00",
                },
            ],
            opForecast: [],
        };

        const html = renderToStaticMarkup(createElement(RunwayTab, { data }));
        expect(html).toContain("Revenue");
        expect(html).toContain("Compute");
        expect(html).not.toContain("<span>mode</span>");
        expect(html).toContain('aria-expanded="false"');
        expect(html).not.toContain(">stripe<");
        expect(html).not.toContain(">aws<");
        expect(html).toContain("Cash change");
        expect(html).toContain("Cash balance");
    });

    it("does not present a missing next-month plan as zero change", () => {
        const html = renderToStaticMarkup(
            createElement(RunwayTab, {
                data: {
                    opTransactions: [
                        {
                            entry_id: "opening",
                            kind: "opening_balance",
                            source: "wise",
                            date: "2026-01-01",
                            vendor: "wise",
                            category: "balance_sheet",
                            amount: 1_000,
                            currency: "USD",
                            description: "Opening balance",
                            evidence: "Statement",
                            recorded_at: "2026-08-01 00:00:00",
                        },
                    ],
                    opForecast: [
                        {
                            entry_id: "august",
                            month: "2026-08-01",
                            vendor: "aws",
                            category: "compute",
                            amount: -100,
                            currency: "USD",
                            method: "fixed",
                            source: "reviewed",
                            evidence: "plan",
                            recorded_at: "2026-08-01 00:00:00",
                        },
                        {
                            entry_id: "october",
                            month: "2026-10-01",
                            vendor: "aws",
                            category: "compute",
                            amount: -100,
                            currency: "USD",
                            method: "fixed",
                            source: "reviewed",
                            evidence: "plan",
                            recorded_at: "2026-08-01 00:00:00",
                        },
                    ],
                },
            }),
        );

        expect(html).toContain("Next full month change");
        expect(html).toContain("plan unavailable");
        expect(html).toContain("no bank movements");
        expect(html).not.toContain("opening balance missing");
    });
});

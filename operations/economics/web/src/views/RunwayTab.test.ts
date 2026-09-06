import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PRIVATE_CONFIG_FIXTURE } from "../fixtures";
import { automaticForecastRule } from "../lib/forecastTerms";
import type { Data } from "../types";
import {
    fmtRunwayTableValue,
    fmtRunwayUsd,
    forecastMethodHint,
    forecastMethodLabel,
    paymentTimingHint,
    paymentTimingLabel,
    RunwayTab,
    runwayMonthLabel,
    runwayPeriodText,
    runwayValueClass,
} from "./RunwayTab";

describe("RunwayTab labels", () => {
    it("shows full rounded runway amounts without compact suffixes", () => {
        expect(fmtRunwayUsd(12_345.67)).toBe("$12,346");
        expect(fmtRunwayUsd(-1_234.56)).toBe("−$1,235");
        expect(fmtRunwayUsd(0)).toBe("$0");
        expect(fmtRunwayUsd(null)).toBe("–");
    });

    it("omits repeated currency symbols inside the runway table", () => {
        expect(fmtRunwayTableValue(12_345.67)).toBe("12,346");
        expect(fmtRunwayTableValue(-1_234.56)).toBe("−1,235");
        expect(fmtRunwayTableValue(0)).toBe("0");
        expect(fmtRunwayTableValue(null)).toBe("–");
    });

    it("uses explicit full month names for the runway horizon", () => {
        expect(runwayMonthLabel("2027-12")).toBe("December 2027");
        expect(
            runwayPeriodText({
                capped: true,
                exhaustedMonth: null,
                lastMonth: "2027-12",
            }),
        ).toBe("December 2027+");
        expect(
            runwayPeriodText({
                capped: false,
                exhaustedMonth: "2027-03",
                lastMonth: "2027-12",
            }),
        ).toBe("March 2027");
    });

    it("uses plain labels for the forecast methods", () => {
        expect(forecastMethodLabel("fixed")).toBe("FIXED");
        expect(forecastMethodLabel("funded")).toBe("FUNDED");
        expect(forecastMethodLabel("last")).toBe("RUN RATE");
        expect(forecastMethodLabel("one_off")).toBe("ONE-TIME");
        expect(forecastMethodLabel(null)).toBeNull();
    });

    it("explains forecast methods on vendor hover", () => {
        expect(forecastMethodHint("fixed")).toBe(
            "Uses a fixed monthly amount.",
        );
        expect(forecastMethodHint("funded")).toBe(
            "Covered by verified vendor credits or prepaid balance.",
        );
        expect(forecastMethodHint("last")).toBe(
            "Uses the latest reviewed monthly run rate.",
        );
        expect(forecastMethodHint("one_off")).toBe(
            "Included only in this month.",
        );
        expect(forecastMethodHint(null)).toBeNull();
    });

    it("explains when forecast cash moves", () => {
        expect(paymentTimingLabel("direct")).toBe("DIRECT");
        expect(paymentTimingLabel("prepaid")).toBe("PREPAID");
        expect(paymentTimingLabel("postpaid")).toBe("POSTPAID");
        expect(paymentTimingLabel(null)).toBeNull();
        expect(paymentTimingHint("direct")).toBe(
            "Cash moves in the projected month.",
        );
        expect(paymentTimingHint("prepaid")).toContain(
            "existing balance is consumed first",
        );
        expect(paymentTimingHint("postpaid")).toBe(
            "Usage is paid after the service period.",
        );
    });

    it("uses the same projection rules for labels and calculations", () => {
        for (const vendor of ["fal", "fireworks", "vast"]) {
            expect(automaticForecastRule(vendor, "compute")).toMatchObject({
                method: "last",
                paymentTiming: "prepaid",
            });
        }
    });

    it("colors cash values without overemphasizing zeroes", () => {
        expect(runwayValueClass(10)).toBe("text-outcome-positive-text");
        expect(runwayValueClass(-10)).toBe("text-outcome-negative-text");
        expect(runwayValueClass(0)).toBe("text-theme-text-soft");
        expect(runwayValueClass(null)).toBe("text-theme-text-soft");
    });

    it("shows category totals while vendor detail starts collapsed", () => {
        const data: Data = {
            privateConfig: PRIVATE_CONFIG_FIXTURE,
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
        };

        const html = renderToStaticMarkup(
            createElement(RunwayTab, { data, year: "2026" }),
        );
        expect(html).toContain("Revenue");
        expect(html).toContain("Compute");
        expect(html).not.toContain("<span>mode</span>");
        expect(html).toContain('aria-expanded="false"');
        expect(html).not.toContain(">stripe<");
        expect(html).not.toContain(">aws<");
        expect(html).toContain("Cash change");
        expect(html).toContain("Cash balance");
        expect(html).toContain('class="sr-only">Line item</span>');
        expect(html).not.toContain(">Actual</span>");
        expect(html).toContain(">Plan</span>");
    });

    it("derives the next-month plan without a forecast feed", () => {
        const html = renderToStaticMarkup(
            createElement(RunwayTab, {
                year: "2026",
                data: {
                    privateConfig: PRIVATE_CONFIG_FIXTURE,
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
                },
            }),
        );

        expect(html).toContain("Cash now");
        expect(html).toContain("August month-end cash");
        expect(html).toContain("September cash change");
        expect(html).toContain("forecast line");
        expect(html).toContain("no bank movements");
        expect(html).not.toContain("opening balance missing");
    });
});

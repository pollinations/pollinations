import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Data } from "../types";
import {
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

    it("uses compact labels for the two forecast methods", () => {
        expect(forecastMethodLabel("last")).toBe("LAST");
        expect(forecastMethodLabel("zero")).toBe("0");
        expect(forecastMethodLabel(null)).toBeNull();
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
                    entry_id: "revenue",
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

        const html = renderToStaticMarkup(createElement(RunwayTab, { data }));
        expect(html).toContain("Revenue");
        expect(html).toContain("Compute");
        expect(html).toContain('aria-expanded="false"');
        expect(html).not.toContain(">stripe<");
        expect(html).not.toContain(">aws<");
    });
});

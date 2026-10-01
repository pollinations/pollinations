import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Gauge, gaugeParts } from "./EconomicsGauge";

describe("gaugeParts", () => {
    it("splits two values with no volume scaling", () => {
        expect(gaugeParts(75, 25)).toEqual({
            leftPct: 75,
            rightPct: 25,
        });
    });

    it("returns null when there is nothing to draw", () => {
        expect(gaugeParts(0, 0)).toBeNull();
    });
});

describe("Gauge", () => {
    it("uses shared Paid and Quest wallet colors", () => {
        const markup = renderToStaticMarkup(
            createElement(Gauge, {
                left: 75,
                leftLabel: "Paid",
                right: 25,
                rightLabel: "Quest",
            }),
        );
        expect(markup).toContain("bg-paid-soft");
        expect(markup).toContain("bg-tier-soft");
    });

    it("uses package-owned neutrals for cash and credit", () => {
        const markup = renderToStaticMarkup(
            createElement(Gauge, {
                left: 75,
                leftLabel: "cash",
                palette: "neutral",
                right: 25,
                rightLabel: "credit",
            }),
        );
        expect(markup).toContain("bg-theme-text-strong/70");
        expect(markup).toContain("bg-theme-text-muted/40");
    });
});

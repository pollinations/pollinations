import { describe, expect, it } from "vitest";
import type { EconRow } from "../lib/insights";
import {
    driftFlag,
    gaugeParts,
    hasEconActivity,
    isGpuVendor,
    visibleEconRows,
} from "./EconTable";

const row = (vendor: string, model: string | null): EconRow => ({
    vendor,
    model,
    soldPaidUsd: 0,
    ecoPaidUsd: 0,
    retainedPaidUsd: 0,
    soldQuestsUsd: 0,
    trueCostPaidUsd: 0,
    questBurnUsd: 0,
    calib: null,
    pollenPriced: false,
    creditSharePct: null,
    trueMultiplier: null,
    marginUsd: 0,
    flags: [],
});

describe("visibleEconRows", () => {
    const rows = [row("aws", "nova"), row("google", null)];

    it("filters by vendor", () => {
        expect(visibleEconRows(rows, "aws")).toEqual([row("aws", "nova")]);
    });

    it("passes everything through for all", () => {
        expect(visibleEconRows(rows, "all")).toEqual(rows);
    });
});

describe("hasEconActivity", () => {
    it("hides rows with no economics to display", () => {
        expect(hasEconActivity(row("community", "empty"))).toBe(false);
    });

    it("keeps tiny non-zero rows", () => {
        expect(
            hasEconActivity({
                ...row("community", "tiny"),
                questBurnUsd: 0.001,
            }),
        ).toBe(true);
    });
});

describe("driftFlag", () => {
    it("stays quiet for healthy calibration", () => {
        expect(driftFlag(null)).toBeNull();
        expect(driftFlag(1)).toBeNull();
        expect(driftFlag(1.9)).toBeNull();
        expect(driftFlag(0.6)).toBeNull();
    });

    it("flags severe over- and under-metering both ways", () => {
        expect(driftFlag(7)).toBe("7× meter drift");
        expect(driftFlag(2)).toBe("2× meter drift");
        expect(driftFlag(0.5)).toBe("0.5× meter drift");
    });
});

describe("gaugeParts", () => {
    it("splits paid vs quests with no volume scaling", () => {
        expect(gaugeParts(75, 25)).toEqual({ paidPct: 75, questsPct: 25 });
    });

    it("returns null when there is nothing to draw", () => {
        expect(gaugeParts(0, 0)).toBeNull();
    });
});

describe("isGpuVendor", () => {
    it("returns true for gpu vendors", () => {
        expect(isGpuVendor("runpod")).toBe(true);
        expect(isGpuVendor("lambda")).toBe(true);
        expect(isGpuVendor("vast.ai")).toBe(true);
    });

    it("returns false for request-based vendors", () => {
        expect(isGpuVendor("fireworks")).toBe(false);
        expect(isGpuVendor("google")).toBe(false);
        expect(isGpuVendor("openrouter")).toBe(false);
    });
});

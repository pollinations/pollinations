import { describe, expect, it } from "vitest";
import type { EconRow } from "../lib/insights";
import {
    driftFlag,
    gaugeParts,
    hasEconActivity,
    pollenSoldUsd,
    usageMatchPct,
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

    it("keeps quest-only provider-funded rows", () => {
        expect(
            hasEconActivity({
                ...row("perplexity", "sonar"),
                questBurnUsd: 100,
                creditSharePct: 100,
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

describe("pollenSoldUsd", () => {
    it("sums sold value only — paid revenue plus quest usage at sold prices", () => {
        expect(
            pollenSoldUsd({
                ...row("aws", "nova"),
                soldPaidUsd: 100,
                soldQuestsUsd: 40,
                questBurnUsd: 999,
                trueCostPaidUsd: 999,
            }),
        ).toBe(140);
    });

    it("keeps a healthy markup visible instead of faking a reconciliation gap", () => {
        // Vendor billed $100 (all cash), we sold the same usage for $100:
        // Match must be 100%, not diluted by cost-side terms.
        const reconciled = {
            ...row("aws", "nova"),
            soldPaidUsd: 60,
            soldQuestsUsd: 40,
            trueCostPaidUsd: 80,
            questBurnUsd: 20,
        };
        expect(usageMatchPct(pollenSoldUsd(reconciled), 100)).toBe(100);
    });
});

describe("usageMatchPct", () => {
    it("returns 100 when both sides match", () => {
        expect(usageMatchPct(100, 100)).toBe(100);
    });

    it("uses the smaller side over the larger side", () => {
        expect(usageMatchPct(75, 100)).toBe(75);
        expect(usageMatchPct(100, 25)).toBe(25);
    });

    it("returns zero when only one side exists", () => {
        expect(usageMatchPct(0, 100)).toBe(0);
        expect(usageMatchPct(100, 0)).toBe(0);
    });

    it("returns null when neither side exists", () => {
        expect(usageMatchPct(0, 0)).toBeNull();
    });
});

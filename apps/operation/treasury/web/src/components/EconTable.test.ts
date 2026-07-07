import { describe, expect, it } from "vitest";
import type { EconRow } from "../lib/insights";
import { gaugeParts, visibleEconRows } from "./EconTable";

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

describe("gaugeParts", () => {
    it("splits paid vs quests with no volume scaling", () => {
        expect(gaugeParts(75, 25)).toEqual({ paidPct: 75, questsPct: 25 });
    });

    it("returns null when there is nothing to draw", () => {
        expect(gaugeParts(0, 0)).toBeNull();
    });
});

import { describe, expect, it } from "vitest";
import type { ModelEconomics } from "../lib/insights";
import { gaugeParts, visibleModelRows } from "./ModelsTab";

const row = (vendor: string, model: string): ModelEconomics => ({
    vendor,
    model,
    grossPaidUsd: 0,
    ecoPaidUsd: 0,
    retainedPaidUsd: 0,
    grossQuestsUsd: 0,
    registeredCostUsd: 0,
    sharePct: 0,
    basis: "registered",
    trueCostUsd: 0,
    marginUsd: 0,
    effectiveMultiplier: null,
});

describe("visibleModelRows", () => {
    const rows = [row("aws", "nova"), row("google", "gemini")];

    it("filters by vendor", () => {
        expect(visibleModelRows(rows, "aws")).toEqual([row("aws", "nova")]);
    });

    it("passes everything through for all", () => {
        expect(visibleModelRows(rows, "all")).toEqual(rows);
    });
});

describe("gaugeParts", () => {
    it("scales the bar to the largest model and splits paid vs quests", () => {
        expect(gaugeParts(75, 25, 200)).toEqual({
            widthPct: 50,
            paidPct: 75,
            questsPct: 25,
        });
    });

    it("returns null when there is nothing to draw", () => {
        expect(gaugeParts(0, 0, 100)).toBeNull();
        expect(gaugeParts(1, 1, 0)).toBeNull();
    });
});

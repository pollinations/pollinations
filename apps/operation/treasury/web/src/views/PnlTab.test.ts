import { describe, expect, it } from "vitest";
import type { PnlMonth } from "../lib/insights";
import { totalsRow } from "./PnlTab";

const month = (over: Partial<PnlMonth>): PnlMonth => ({
    month: "2026-05",
    revenueNetUsd: null,
    categories: {},
    spendUsd: null,
    cashPnlUsd: null,
    creditBurnUsd: 0,
    opexIncomplete: false,
    ...over,
});

describe("totalsRow", () => {
    it("sums present values and keeps all-null columns null", () => {
        const rows = [
            month({
                revenueNetUsd: 100,
                spendUsd: 40,
                cashPnlUsd: 60,
                creditBurnUsd: 5,
                categories: { compute: 40 },
            }),
            month({ month: "2026-06", categories: {} }),
        ];
        const totals = totalsRow(rows, ["compute", "saas"]);
        expect(totals.revenueNetUsd).toBe(100);
        expect(totals.spendUsd).toBe(40);
        expect(totals.cashPnlUsd).toBe(60);
        expect(totals.creditBurnUsd).toBe(5);
        expect(totals.categories.compute).toBe(40);
        expect(totals.categories.saas).toBeNull();
    });
});

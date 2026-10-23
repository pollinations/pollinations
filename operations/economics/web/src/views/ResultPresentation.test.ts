import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { ReconciliationIssue } from "../lib/reconciliation";
import { unitEconomicsReport } from "../lib/unitEconomics";
import type { Data, OpPollenRow, VendorLedgerRow } from "../types";
import { TrendsTab } from "./TrendsTab";
import { ManagedInferenceTab } from "./UnitEconomicsTab";

const usage = (month: string, paid: number): OpPollenRow => ({
    month,
    vendor: "google",
    model: "model",
    currency: "USD",
    price_paid: paid,
    price_quests: 0,
    cost_paid: 50,
    cost_quests: 0,
    byop_paid: 0,
    byop_quests: 0,
    model_paid: 0,
    model_quests: 0,
    requests_paid: 10,
    requests_quests: 0,
});
const cost = (
    month: string,
    vendor = "google",
    paid = -50,
): VendorLedgerRow => ({
    entry_id: `${vendor}-${month}`,
    vendor,
    source: "dashboard",
    type: "inference",
    start: `${month}-01`,
    end: `${month}-30`,
    paid,
    credit: 0,
    currency: "USD",
    resource_id: "usage",
    resource_name: "Usage",
    resource_sku: "tokens",
    resource_count: 1,
    model: "model",
    evidence: "Provider statement",
    recorded_at: "2026-10-16 00:00:00",
});
const completeData = (): Data => ({
    opPollen: [usage("2026-08", 100), usage("2026-09", 200)],
    vendorLedger: [cost("2026-08"), cost("2026-09")],
});
function pollenChart(data: Data, issues: ReconciliationIssue[] = []) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
    const html = renderToStaticMarkup(
        createElement(TrendsTab, {
            data,
            issues,
            period: 3,
            initialMonth: "2026-09",
            onPeriodChange: () => {},
        }),
    );
    const start = html.indexOf('aria-label="Pollen consumed"');
    expect(start).toBeGreaterThanOrEqual(0);
    return html.slice(start, html.indexOf("</section>", start));
}
afterEach(() => vi.useRealTimers());

it("keeps the recorded inference result and marks incomplete coverage", () => {
    const data = completeData();
    data.vendorLedger?.push(cost("2026-09", "openai", -3));
    const before = JSON.stringify(data);
    const report = unitEconomicsReport(data, "2026-09", "inference");
    expect(report.provisional).toBe(true);
    expect(report.currentResultUsd).toBe(147);
    const html = renderToStaticMarkup(
        createElement(ManagedInferenceTab, { data, month: "2026-09" }),
    );
    const cards = html.slice(0, html.indexOf("<table"));
    expect(cards).toContain("Provisional");
    expect(cards).toContain("+$147");
    expect(cards).not.toContain("Actual +$147");
    expect(cards).not.toContain(">Unknown<");
    expect(JSON.stringify(data)).toBe(before);
});

it.each(["2026-08", "2026-09"])(
    "withholds Pollen changes when %s has recorded costs without usage",
    (month) => {
        const data = completeData();
        data.vendorLedger?.push(cost(month, "openai", -3));
        const chart = pollenChart(data);
        expect(chart).toContain("Provisional · comparison pending");
        expect(chart).toContain(">200<");
        expect(chart).not.toContain("+100%");
    },
);

it("keeps a complete Pollen comparison available despite an unrelated invoice check", () => {
    const chart = pollenChart(completeData(), [
        {
            id: "2026-09|google",
            month: "2026-09",
            vendor: "google",
            types: ["documents"],
            messages: ["Supplier invoice needs validation."],
            affects: ["vendor-ledger", "vendors", "trends"],
            priority: 1,
            group: "validation",
            amountUsd: 50,
            amountLabel: "Recorded cost",
            evidence: [],
        },
    ]);
    expect(chart).toContain("+100%");
    expect(chart).not.toContain("Provisional · comparison pending");
});

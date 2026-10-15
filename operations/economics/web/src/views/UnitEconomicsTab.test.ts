import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { Data, OpPollenRow, VendorLedgerRow } from "../types";
import { ManagedInferenceTab } from "./UnitEconomicsTab";

const usage = (vendor: string): OpPollenRow => ({
    month: "2026-09",
    vendor,
    model: "model",
    currency: "USD",
    price_paid: 100,
    price_quests: 0,
    cost_paid: 70,
    cost_quests: 0,
    byop_paid: 5,
    byop_quests: 0,
    model_paid: 0,
    model_quests: 0,
    requests_paid: 10,
    requests_quests: 0,
});
const cost = (vendor: string, month: string): VendorLedgerRow => ({
    entry_id: `${vendor}-${month}`,
    vendor,
    source: "dashboard",
    type: "inference",
    start: `${month}-01`,
    end: `${month}-30`,
    paid: -50,
    credit: 0,
    currency: "USD",
    resource_id: "usage",
    resource_name: "Usage",
    resource_sku: "tokens",
    resource_count: 1,
    model: "model",
    evidence: "statement",
    recorded_at: "2026-10-14 00:00:00",
});
it("counts known Paid usage even without current costs and withholds incomplete profit", () => {
    const data: Data = {
        opPollen: [usage("aws"), usage("google")],
        vendorLedger: [cost("aws", "2026-08"), cost("google", "2026-09")],
    };
    const html = renderToStaticMarkup(
        createElement(ManagedInferenceTab, { data, month: "2026-09" }),
    );
    expect(html).not.toContain("Usage included; provider costs missing.");
    expect(html).toContain("$190");
    expect(html).toContain("aws");
    expect(html).toContain("Retained Paid");
    expect(html).not.toContain("classified only");
    expect(html).not.toContain("Current result · subtotal");
    expect(html).not.toContain("awaiting complete evidence");
    for (const diagnostic of [
        "source gap",
        "Assigned to models",
        "needs mapping",
        "missing breakdown",
        "Cost check",
    ])
        expect(html).not.toContain(diagnostic);
    // Both result headlines must remain unknown, not Google's matched subtotal.
    const cards = html.slice(0, html.indexOf("<table"));
    expect(cards.match(/>Unknown</g)).toHaveLength(2);
});

it("shows complete results when both providers have usage and costs", () => {
    const html = renderToStaticMarkup(
        createElement(ManagedInferenceTab, {
            data: {
                opPollen: [usage("aws"), usage("google")],
                vendorLedger: [
                    cost("aws", "2026-09"),
                    cost("google", "2026-09"),
                ],
            },
            month: "2026-09",
        }),
    );
    expect(html).toContain("$190");
    expect(html).toContain("+$90");
    expect(html).not.toContain("awaiting complete evidence");
    expect(html).not.toContain("provider costs missing");
});

it("keeps separately scoped infrastructure usage from invalidating complete inference results", () => {
    const html = renderToStaticMarkup(
        createElement(ManagedInferenceTab, {
            data: {
                opPollen: [usage("google"), usage("exa")],
                vendorLedger: [cost("google", "2026-09")],
            },
            month: "2026-09",
        }),
    );
    expect(html).toContain("+$45");
    expect(html).not.toContain("awaiting complete evidence");
    expect(html).not.toContain("outside this inference view");
});

it("labels both recorded-figures results provisional and includes the unmatched provider cost", () => {
    const html = renderToStaticMarkup(
        createElement(ManagedInferenceTab, {
            data: {
                opPollen: [usage("google")],
                vendorLedger: [
                    cost("google", "2026-09"),
                    { ...cost("openai", "2026-09"), paid: -3, credit: -7 },
                ],
            },
            month: "2026-09",
        }),
    );
    const cards = html.slice(0, html.indexOf("<table"));
    expect(cards).toContain("Current result · provisional");
    expect(cards).toContain("Full-cost result · provisional");
    expect(cards).toContain("+$42");
    expect(cards).toContain("+$35");
    expect(cards).not.toContain(">Unknown<");
});

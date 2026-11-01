import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReconcileProContext } from "../components/ReconcilePro";
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
    expect(html).toContain("$200");
    expect(html).toContain("aws");
    expect(html).toContain("Retained");
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
    expect(cards).not.toContain("Actual Unknown");
    expect(cards).not.toContain("recorded so far");
    expect(cards).toContain('aria-label="Provider costs"');
});

it("pairs usage, funding and complete results in three cards without repeating Quest", () => {
    const html = renderToStaticMarkup(
        createElement(ManagedInferenceTab, {
            data: {
                opPollen: [
                    { ...usage("aws"), price_quests: 25 },
                    { ...usage("google"), price_quests: 35 },
                ],
                vendorLedger: [
                    { ...cost("aws", "2026-09"), credit: -10 },
                    { ...cost("google", "2026-09"), credit: -20 },
                ],
            },
            month: "2026-09",
        }),
    );
    const cards = html.slice(0, html.indexOf("<table"));
    expect(cards.match(/<\/section>/g)).toHaveLength(3);
    expect(cards).toContain('aria-label="Pollen used"');
    expect(cards).toContain('aria-label="Provider costs"');
    expect(cards).toContain('aria-label="Result"');
    expect(cards.match(/>Quest</g)).toHaveLength(1);
    expect(cards).not.toContain("Quest used");
    expect(cards).toContain("$200");
    expect(cards).toContain("$260 total");
    expect(cards).not.toContain("Free usage");
    expect(cards).not.toContain("Retained Paid");
    expect(cards).not.toContain("Retained");
    expect(cards).toContain(">$60<");
    expect(cards).toContain("$130 total");
    expect(cards).toContain(">$100<");
    expect(cards).toContain(">$30<");
    expect(cards).toContain("+$90");
    expect(cards).not.toContain("Actual +$90");
    expect(cards.match(/>77%</g)).toHaveLength(2);
    expect(cards.match(/>23%</g)).toHaveLength(2);
    const result = cards.slice(cards.indexOf('aria-label="Result"'));
    expect(result).not.toContain("%");
    expect(cards).toContain("+$60");
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

it("includes unmatched provider costs while leaving status details to reconciliation", () => {
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
    expect(cards).toContain('aria-label="Result"');
    expect(cards).toMatch(/provisional/i);
    expect(cards).toContain(">With credits<");
    expect(cards).toContain(">Without credits<");
    expect(cards).toContain("+$42");
    expect(cards).toContain("+$35");
    expect(cards).not.toContain(">Unknown<");
});

it("hides a tiny model while including its exact cost and usage in the headline totals", () => {
    const smallUsage = {
        ...usage("google"),
        model: "tiny-model",
        price_paid: 0.75,
        price_quests: 0,
        byop_paid: 0,
        cost_paid: 0.6,
    };
    const smallCost = {
        ...cost("google", "2026-09"),
        entry_id: "tiny",
        model: "tiny-model",
        paid: -0.6,
    };
    const data: Data = {
        opPollen: [usage("google"), smallUsage],
        vendorLedger: [cost("google", "2026-09"), smallCost],
    };
    const before = JSON.stringify(data);
    const html = renderToStaticMarkup(
        createElement(ManagedInferenceTab, { data, month: "2026-09" }),
    );
    const cards = html.slice(0, html.indexOf("<table"));
    expect(cards).toContain("$101 total");
    expect(cards).toContain("$51 total");
    expect(html).not.toContain("tiny-model");
    const pro = renderToStaticMarkup(
        createElement(
            ReconcileProContext.Provider,
            { value: true },
            createElement(ManagedInferenceTab, { data, month: "2026-09" }),
        ),
    );
    expect(pro).toContain("tiny-model");
    expect(pro).toContain("$100.75 total");
    expect(pro).toContain("$50.6 total");
    expect(pro).toContain("$0.75");
    expect(JSON.stringify(data)).toBe(before);
});

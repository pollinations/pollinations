import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type {
    Data,
    EconomicsPrivateConfig,
    OpPollenRow,
    VendorLedgerRow,
} from "../types";
import { ReconciliationTab } from "../views/ReconciliationTab";
import {
    type ReconciliationIssue,
    reconciliationState,
} from "./reconciliation";

import { vendorSourceDifferences } from "./vendorLedger";

const now = new Date("2026-10-16T12:00:00Z");
const blankConfig = (): EconomicsPrivateConfig => ({
    forecastRules: {},
    reviewNotes: {
        providerCheckExplanations: [],
        meterDriftExplanations: [],
        pollenWitnessExplanations: [],
    },
});
const cost = (vendor: string, month = "2026-09"): VendorLedgerRow => ({
    entry_id: vendor,
    vendor,
    source: "dashboard",
    type: "inference",
    start: `${month}-01T00:00:00Z`,
    end: "2026-10-01T00:00:00Z",
    paid: -50,
    credit: 0,
    currency: "USD",
    resource_id: "usage",
    resource_name: "Usage",
    resource_sku: "tokens",
    resource_count: 1,
    model: "model",
    evidence: "https://drive.google.com/file/d/provider-source/view",
    recorded_at: "2026-10-16 00:00:00",
});
const usage = (vendor: string, month = "2026-09"): OpPollenRow => ({
    month,
    vendor,
    model: "model",
    currency: "USD",
    cost_paid: 70,
    cost_quests: 0,
    price_paid: 100,
    price_quests: 0,
    byop_paid: 0,
    byop_quests: 0,
    model_paid: 0,
    model_quests: 0,
    requests_paid: 1,
    requests_quests: 0,
});

it("retains separate funding and model-allocation amounts without summing them", () => {
    const privateConfig = blankConfig();
    const data: Data = {
        vendorStatements: [
            {
                ...cost("openrouter"),
                entry_id: "statement",
                type: "statement",
                resource_name: "Grant funding",
                paid: 0,
                statement_amount: -2.65,
                compared_entry_ids: ["openrouter"],
                comparison_basis: "balance",
                comparison_month: "2026-09",
            },
        ],
        privateConfig,
        opPollen: [usage("openrouter")],
        vendorLedger: [
            {
                ...cost("openrouter"),
                paid: -3.15,
                model: "",
                resource_name: "Unallocated",
            },
        ],
    };
    const issue = reconciliationState(data, now).issues.find(
        (row) => row.id === "2026-09|openrouter",
    );
    expect(issue).toMatchObject({
        group: "financial",
        amountUsd: 0.5,
        amountLabel: "Funding difference",
    });
    expect(issue?.relatedAmounts).toEqual(
        expect.arrayContaining([
            {
                group: "financial",
                amountUsd: 0.5,
                amountLabel: "Funding difference",
            },
            {
                group: "models",
                amountUsd: 3.15,
                amountLabel: "Recorded cost · model allocation only",
            },
        ]),
    );
});

it("merges incomplete coverage into the financial group without discarding an existing meter difference", () => {
    const data: Data = {
        opPollen: [usage("perplexity", "2026-02")],
        vendorLedger: [
            {
                ...cost("perplexity", "2026-02"),
                end: "2026-02-20T00:00:00Z",
                paid: -500,
            },
        ],
    };
    const issue = reconciliationState(data, now).issues.find(
        (row) => row.id === "2026-02|perplexity",
    );
    expect(issue).toMatchObject({
        group: "financial",
        amountUsd: null,
        amountLabel: "Impact unknown",
    });
    expect(issue?.types).toEqual(
        expect.arrayContaining(["quality", "coverage"]),
    );
    expect(issue?.affects).toEqual(
        expect.arrayContaining(["trends", "runway", "inference"]),
    );
    expect(issue?.relatedAmounts).toContainEqual({
        group: "validation",
        amountUsd: 430,
        amountLabel: "Provider / usage-meter difference",
    });
});

it("retains accepted lost documents and provider exceptions outside open-check counts", () => {
    const privateConfig = blankConfig();
    privateConfig.reviewNotes.providerCheckExplanations = [
        {
            month: "2026-02",
            provider: "pruna",
            reason: "unverifiable_history",
            explanation: "The historical usage export is unavailable.",
            evidence: ["https://drive.google.com/file/d/accepted-review/view"],
        },
    ];
    const data: Data = {
        privateConfig,
        vendorLedger: [
            {
                ...cost("pruna", "2026-02"),
                source: "manual",
                end: "2026-03-01T00:00:00Z",
                evidence: "Legacy amount cannot be validated.",
            },
        ],
        opTransactions: [
            {
                entry_id: "discord-lost",
                kind: "transaction",
                source: "wise",
                date: "2026-02-10",
                vendor: "discord",
                category: "operations",
                amount: -10,
                currency: "USD",
                description:
                    "Discord · supplier invoice unavailable; standing exception retained",
                evidence: "",
                recorded_at: "2026-10-16 00:00:00",
            },
        ],
    };
    const state = reconciliationState(data, now);
    expect(state.acceptedExceptions.map((row) => row.id)).toEqual([
        "2026-02|discord",
        "2026-02|pruna",
    ]);
    expect(
        state.acceptedExceptions.find((row) => row.vendor === "pruna")
            ?.messages,
    ).toContain("The historical usage export is unavailable.");
    expect(
        state.issues.some(
            (row) => row.vendor === "discord" && row.month === "2026-02",
        ),
    ).toBe(false);
    expect(
        state.issues.find(
            (row) => row.vendor === "pruna" && row.month === "2026-02",
        )?.types,
    ).not.toContain("coverage");
});

it("attaches reviewed usage limitations instead of requesting their collection again", () => {
    const privateConfig = blankConfig();
    privateConfig.reviewNotes.pollenWitnessExplanations = [
        {
            month: "2026-04",
            provider: "replicate",
            reason: "pre_meter_coverage",
            explanation: "Provider activity predates retained Pollen metering.",
            evidence: [
                "https://drive.google.com/file/d/meter-start-review/view",
            ],
        },
    ];
    const state = reconciliationState(
        {
            privateConfig,
            vendorLedger: [
                {
                    ...cost("replicate", "2026-04"),
                    end: "2026-05-01T00:00:00Z",
                },
            ],
        },
        now,
    );
    const issue = state.issues.find((row) => row.id === "2026-04|replicate");
    expect(issue?.messages).toContain(
        "Pollen usage is unavailable for a reviewed historical period.",
    );
    expect(issue?.messages.join(" ")).not.toContain(
        "Import the usage or record verified zero activity",
    );
    expect(issue?.reviewedNotes).toContainEqual({
        message: "Provider activity predates retained Pollen metering.",
        evidence: ["https://drive.google.com/file/d/meter-start-review/view"],
    });
});

it("keeps supporting evidence and secondary amounts collapsed while preserving invoice-only cells", () => {
    const issue: ReconciliationIssue = {
        id: "2026-09|openrouter",
        month: "2026-09",
        vendor: "openrouter",
        messages: ["Funding difference."],
        types: ["quality", "models"],
        affects: ["inference"],
        priority: 1,
        group: "financial",
        amountUsd: 0.5,
        amountLabel: "Funding difference",
        evidence: ["https://drive.google.com/file/d/usage-source/view"],
        relatedAmounts: [
            {
                group: "financial",
                amountUsd: 0.5,
                amountLabel: "Funding difference",
            },
            {
                group: "models",
                amountUsd: 3.15,
                amountLabel: "Model allocation",
            },
        ],
        reviewedNotes: [
            { message: "The original usage export is retained.", evidence: [] },
        ],
    };
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [issue],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).toContain("Other amounts · 1");
    expect(html).toContain("$3");
    expect(html).not.toContain("$4");
    expect(html).toContain("Sources and review");
    expect(html).toContain('aria-label="Preview source 1 for openrouter"');
    expect(html).not.toContain('aria-label="Preview invoice');
    expect(html).not.toContain("<details open");
});

it("scopes accepted exceptions to the year across all pages without adding open checks", () => {
    const exception = {
        id: "2026-02|pruna",
        vendor: "pruna",
        month: "2026-02",
        messages: ["Accepted missing history."],
        affects: ["inference" as const],
        evidence: [],
    };
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [],
            year: "2026",
            onOpen: () => {},
            acceptedExceptions: [
                exception,
                {
                    ...exception,
                    id: "other-year",
                    month: "2025-02",
                    vendor: "prior-year",
                },
                {
                    ...exception,
                    id: "bank",
                    vendor: "bank-only",
                    affects: ["op-transactions"],
                },
            ],
        }),
    );
    expect(html).toContain("Known limitations · 2");
    expect(html).toContain("0 open checks");
    expect(html).toContain("Accepted missing history.");
    expect(html).not.toContain("prior-year");
    expect(html).toContain("bank-only");
});

it("retains a verified bank invoice when its service-month cost is still missing", () => {
    const invoice =
        "https://drive.google.com/file/d/retained-cycle-invoice/view";
    const data: Data = {
        opTransactions: [
            {
                entry_id: "tinybird-september-payment",
                kind: "transaction",
                source: "wise",
                date: "2026-09-19",
                vendor: "tinybird",
                category: "infrastructure",
                amount: -266.88,
                currency: "USD",
                description: "Tinybird invoice payment",
                evidence: `evidence_type=supplier_document invoice=cycle-invoice ${invoice}; payment_match=verified`,
                recorded_at: "2026-10-16 00:00:00",
            },
        ],
        vendorLedger: [],
    };
    const issue = reconciliationState(data, now).issues.find(
        (row) => row.id === "2026-09|tinybird",
    );
    expect(issue?.group).toBe("financial");
    expect(issue?.invoices).toEqual([invoice]);
    expect(issue?.messages).toContain(
        "Invoice retained; service-month usage still needs reconciliation.",
    );
    expect(issue?.messages).not.toContain(
        "Bank payment recorded; invoice or service-month usage is missing.",
    );
    expect(issue?.types).toContain("coverage");
    expect(issue?.relatedAmounts).toContainEqual({
        group: "financial",
        amountUsd: 266.88,
        amountLabel: "Bank payment · expense to reconcile",
    });
});

it.each([0, 0.19])(
    "keeps exact linked amounts (%s) in source explanations in every display mode",
    (amount) => {
        const difference = vendorSourceDifferences({
            vendorLedger: [{ ...cost("openrouter"), paid: -amount }],
            vendorStatements: [
                {
                    ...cost("openrouter"),
                    entry_id: "statement",
                    type: "statement",
                    paid: 0,
                    statement_amount: 1,
                    compared_entry_ids: ["openrouter"],
                },
            ],
        });
        expect(difference).toHaveLength(1);
        expect(difference[0].explanation).toContain(
            `linked records total ${amount} USD`,
        );
        expect(difference[0].amountUsd).toBeCloseTo(1 - amount);
    },
);

it("retains funding gaps in reconciliation when the baseline split supports a provisional plan", () => {
    const state = reconciliationState(
        { privateConfig: blankConfig(), vendorLedger: [cost("fal")] },
        now,
    );
    expect(state.issues.flatMap((issue) => issue.messages).join(" ")).toContain(
        "funding depletion is unverified",
    );
});

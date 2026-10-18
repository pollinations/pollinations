import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReconcileProContext } from "../components/ReconcilePro";
import { PRIVATE_CONFIG_FIXTURE } from "../fixtures";
import { PROVIDER_REGISTRY } from "../lib/providerRegistry";
import type {
    ReconciliationException,
    ReconciliationIssue,
} from "../lib/reconciliation";
import type { OpTransactionRow } from "../types";
import { ReconciliationTab } from "./ReconciliationTab";

const issue: ReconciliationIssue = {
    id: "2026-09|aws",
    month: "2026-09",
    vendor: "aws",
    messages: ["Monthly costs missing."],
    types: ["figures", "documents"],
    affects: ["inference", "trends"],
    priority: 0,
    group: "financial",
    amountUsd: 1200,
    amountLabel: "Usage meter estimate · bill and impact unknown",
    evidence: [],
};
const payment: OpTransactionRow = {
    entry_id: "payment",
    kind: "transaction",
    source: "wise",
    date: "2026-09-01",
    vendor: "aws",
    category: "compute",
    amount: -100,
    currency: "USD",
    evidence: "",
    description: "Supplier payment",
    recorded_at: "2026-10-01",
};

const limitation: ReconciliationException = {
    id: "reviewed-august",
    month: "2026-08",
    vendor: "aws",
    messages: ["Historical receipt unavailable."],
    affects: ["inference"],
    evidence: ["https://drive.google.com/file/d/reviewed-receipt/view"],
    relatedAmounts: [
        { amountUsd: 40, amountLabel: "Recorded payment", group: "validation" },
    ],
};

it("puts reviewed limitations under the same vendor without adding open checks or money", () => {
    const before = structuredClone(limitation);
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [issue],
            acceptedExceptions: [limitation],
            transactions: [payment],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html.match(/>aws</g)).toHaveLength(1);
    expect(html).toContain("1 vendors");
    expect(html).toContain("1 open checks");
    expect(html).toContain("1 known limitation");
    expect(html).toContain("Known limitation · reviewed, not an open check");
    expect(html).toContain("Historical receipt unavailable.");
    expect(html).toContain("$40");
    expect(html.match(/\$100</g)).toHaveLength(1);
    expect(html).toContain('aria-label="Preview exception source 1 for aws"');
    expect(html).not.toContain("<summary");
    expect(limitation).toEqual(before);
});

it("shows limitation-only vendors across pages for the selected year", () => {
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [],
            acceptedExceptions: [
                limitation,
                {
                    ...limitation,
                    id: "old",
                    vendor: "old-vendor",
                    month: "2025-08",
                },
                {
                    ...limitation,
                    id: "other",
                    vendor: "other-page",
                    affects: ["runway"],
                },
            ],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).toContain("0 open checks");
    expect(html).toContain("aws");
    expect(html).toContain("Historical receipt unavailable.");
    expect(html).not.toContain("No checks to display");
    expect(html).not.toContain("old-vendor");
    expect(html).toContain("other-page");
    expect(html).not.toContain("amounts unknown");
});
it("shows a yearly grouped table without duplicating multi-type rows", () => {
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [
                issue,
                { ...issue, id: "august", month: "2026-08", vendor: "azure" },
                {
                    ...issue,
                    id: "prior",
                    month: "2025-09",
                    vendor: "prior-year",
                },
            ],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).toContain("2 open checks");
    expect(html).toContain("aws");
    expect(html).toContain("azure");
    expect(html).toContain("Inference");
    expect(html).toContain("Trends");
    expect(html).toContain("impact unknown");
    expect(html).not.toContain("All months");
    expect(html).toContain("<table");
    expect(html).toContain("Amount");
    expect(html).toContain('aria-sort="none"');
    expect(html).not.toContain("prior-year");
    expect(html).toContain("August");
    expect(html).toContain("September");
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(html.match(/ hidden=""/g)).toHaveLength(2);
    expect(html).toContain("Missing figures");
    expect(html).toContain("Documents");
    expect(html.match(/>aws</g)).toHaveLength(1);
    expect(html).not.toContain("Expected billing");
    expect(html).not.toContain("<details");
});

it("filters by year with no hidden affected-page restriction", () => {
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [
                issue,
                {
                    ...issue,
                    id: "runway-sep",
                    month: "2026-09",
                    vendor: "gaswerk",
                    affects: ["runway"],
                },
                {
                    ...issue,
                    id: "old",
                    month: "2025-08",
                    vendor: "old",
                    affects: ["runway"],
                },
            ],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).toContain("gaswerk");
    expect(html).not.toContain("azure");
    expect(html).toContain("aws");
    expect(html).not.toContain("2025-08");
    expect(html).toContain("2 open checks");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("All pages");
    expect(html).toContain('aria-label="Issue type"');
    expect(html).toContain('aria-pressed="true"');
});

it("keeps unknown amounts visible and hides known zero rows without clearing checks", () => {
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [
                { ...issue, amountUsd: null, amountLabel: "Unknown impact" },
                {
                    ...issue,
                    id: "zero",
                    vendor: "zero",
                    amountUsd: 0,
                    amountLabel: "Verified zero",
                },
            ],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).toContain("Unknown");
    expect(html).toContain("1 amounts unknown");
    expect(html).not.toContain("$0");
    expect(html).not.toContain("Verified zero");
    expect(html).toContain("1 vendors");
    expect(html).toContain("1 of 2 open checks shown");
    expect(html).toContain("1 below $1 (Pro)");
});

it("separates model-only details while keeping mixed financial issues visible", () => {
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [
                issue,
                {
                    ...issue,
                    id: "details",
                    vendor: "details-only",
                    types: ["models"],
                    group: "models",
                },
                {
                    ...issue,
                    id: "mixed",
                    vendor: "mixed-financial",
                    types: ["models", "figures"],
                },
            ],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).toContain("3 open checks");
    expect(html).toContain("Could change totals");
    expect(html).not.toContain("Recorded amounts · validate");
    expect(html).toContain("Model/GPU breakdown");
    expect(html).not.toContain('aria-label="Reconciliation sections"');
    expect(html).toContain("mixed-financial");
    expect(html).toContain("details-only");
    expect(html).not.toContain("Expected billing");
});

it("shows deduplicated preview and download icons while keeping collection notes private", () => {
    const link = "https://drive.google.com/file/d/usage-export/view";
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [
                {
                    ...issue,
                    evidence: [link],
                    invoices: [link],
                    archiveChecks: [
                        {
                            month: "2026-09",
                            provider: "aws",
                            account: "payer",
                            checkedAt: "2026-10-15T12:00:00Z",
                            status: "found",
                            note: "Invoice match still needs review.",
                            evidence: [link],
                        },
                    ],
                },
            ],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).not.toContain("Evidence found — needs reconciliation");
    expect(html).not.toContain("payer");
    expect(html).not.toContain("2026-10-15");
    expect(html).not.toContain("Invoice match still needs review.");
    expect(html).toContain('aria-label="Preview invoice 1 for aws"');
    expect(html).toContain('aria-label="Download invoice 1 for aws"');
    expect(
        html.match(
            /href="https:\/\/drive.google.com\/uc\?export=download&amp;id=usage-export"/g,
        ),
    ).toHaveLength(1);
    expect(html).toContain("Monthly costs missing.");
    expect(html).toContain("1 open checks");
});

it("separates exact result blockers from other checks in the same provider month", () => {
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [
                {
                    ...issue,
                    types: ["totals", "models"],
                    blockingMessages: ["Pollen usage is missing."],
                    messages: [
                        "Pollen usage is missing.",
                        "Invoice labels need mapping.",
                    ],
                },
            ],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).toContain("Blocks results");
    expect(html).toContain("Other checks");
    expect(html.match(/Pollen usage is missing\./g)).toHaveLength(1);
    expect(html.indexOf("Pollen usage is missing.")).toBeLessThan(
        html.indexOf("Other checks"),
    );
    expect(html.indexOf("Other checks")).toBeLessThan(
        html.indexOf("Invoice labels need mapping."),
    );
});

it("sorts vendors by unreconciled bank money without adding overlapping issue amounts", () => {
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [
                {
                    ...issue,
                    id: "small",
                    vendor: "small-gap",
                    amountUsd: 5000,
                    types: ["figures"],
                },
                {
                    ...issue,
                    id: "unknown",
                    vendor: "unknown-gap",
                    amountUsd: null,
                },
                {
                    ...issue,
                    id: "large",
                    vendor: "large-gap",
                    amountUsd: 2,
                    types: ["forecast"],
                },
            ],
            transactions: [
                {
                    ...payment,
                    entry_id: "small",
                    vendor: "small-gap",
                    amount: -5,
                },
                {
                    ...payment,
                    entry_id: "large",
                    vendor: "large-gap",
                    amount: -500,
                },
            ],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html.indexOf(">large-gap<")).toBeLessThan(
        html.indexOf(">small-gap<"),
    );
    expect(html.indexOf(">small-gap<")).toBeLessThan(
        html.indexOf(">unknown-gap<"),
    );
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain("Unknown");
    expect(html).toContain("1 amounts unknown");
});

it("combines issue groups across pages into one vendor row for the year", () => {
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [
                { ...issue, amountUsd: null },
                {
                    ...issue,
                    id: "validation",
                    group: "validation",
                    amountUsd: 40,
                },
                { ...issue, id: "models", group: "models", amountUsd: 500 },
                { ...issue, id: "other-page", affects: ["runway"] },
                { ...issue, id: "other-year", month: "2025-09" },
            ],
            transactions: [payment],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).not.toContain('aria-label="Reconciliation overview"');
    expect(html).not.toContain('aria-label="Reconciliation sections"');
    expect(html).toContain("1 vendors");
    expect(html).toContain("4 open checks");
    expect(html).toContain("1 amounts unknown");
    expect(html.match(/>aws</g)).toHaveLength(1);
    expect(html.match(/\$100</g)).toHaveLength(1);
    expect(html).toContain("Could change totals");
    expect(html).toContain("Recorded amounts · validate");
    expect(html).toContain("Model/GPU breakdown");
});

it("reports no flagged issues without claiming a fully verified close", () => {
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).toContain("No checks to display for this selection.");
    expect(html).not.toContain("Data confidence");
    expect(html).not.toContain("100%");
    expect(html).not.toContain("Fully reconciled");
});

it("hides small rows but retains dollar boundaries, unknowns and larger related checks", () => {
    const amounts = [0.99, -1, 1, null, 0.19];
    const issues = amounts.map((amountUsd, index) => ({
        ...issue,
        id: `boundary-${index}`,
        vendor: `boundary-${index}`,
        amountUsd,
        ...(index === 4
            ? {
                  relatedAmounts: [
                      {
                          group: issue.group,
                          amountLabel: "Related expense",
                          amountUsd: 7.44,
                      },
                  ],
              }
            : {}),
    }));
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues,
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).not.toContain("boundary-0");
    for (const index of [1, 2, 3, 4])
        expect(html).toContain(`boundary-${index}`);
    expect(html).toContain("4 vendors");
    expect(html).toContain("$7");
    expect(html).not.toContain("7.44");
    expect(issues.map((row) => row.amountUsd)).toEqual(amounts);
});

it("restores small checks and exact decimal amounts in Reconcile Pro", () => {
    const issues = [{ ...issue, amountUsd: 0.19, vendor: "tiny-gap" }];
    const html = renderToStaticMarkup(
        createElement(
            ReconcileProContext.Provider,
            { value: true },
            createElement(ReconciliationTab, {
                issues,
                year: "2026",
                onOpen: () => {},
            }),
        ),
    );
    expect(html).toContain("tiny-gap");
    expect(html).toContain("$0.19");
    expect(html).toContain("1 vendors");
    expect(issues[0].amountUsd).toBe(0.19);
});

it("joins vendor accounts, journal history and checks without copying source data", () => {
    const provider = PROVIDER_REGISTRY.find((row) => row.accounts?.length);
    assert(provider?.accounts?.[0]);
    const account = provider.accounts[0];
    const config = structuredClone(PRIVATE_CONFIG_FIXTURE);
    config.vendorDocuments = {
        [provider.id]: "https://drive.google.com/file/d/vendor-journal/view",
    };
    config.reviewNotes = {
        providerCheckExplanations: [],
        meterDriftExplanations: [],
        pollenWitnessExplanations: [
            {
                provider: provider.id,
                month: "2025-08",
                reason: "unverifiable_history",
                explanation: "Preserved earlier vendor review",
                evidence: [],
            },
            {
                provider: provider.id,
                month: issue.month,
                reason: "unverifiable_history",
                explanation: issue.messages[0],
                evidence: [],
            },
        ],
        archiveChecks: [
            {
                provider: provider.id,
                account: account.id,
                month: "2026-08",
                checkedAt: "2026-10-15T12:00:00Z",
                status: "not_found",
                note: "Account evidence search completed",
                evidence: [],
            },
        ],
    };
    const data = {
        vendorLedger: [],
        opTransactions: [],
        privateConfig: config,
    };
    const before = structuredClone(data);
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            data,
            issues: [{ ...issue, vendor: provider.id }],
            transactions: [{ ...payment, vendor: provider.id }],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).toContain("Preserved earlier vendor review");
    expect(html.match(/Account evidence search completed/g)).toHaveLength(1);
    expect(html.match(/Monthly costs missing\./g)).toHaveLength(1);
    expect(html).toContain("vendor-journal/view");
    expect(html.match(/\$100</g)).toHaveLength(1);
    expect(html).toContain("1 open checks");
    const other = PROVIDER_REGISTRY.find((row) => row.id !== provider.id);
    assert(other);
    expect(html).toContain(other.label);
    expect(data).toEqual(before);
});

it("opens exactly the badge checks even when their period differs from the selected year", () => {
    const other = {
        ...issue,
        id: "other",
        month: "2025-09",
        vendor: "other-vendor",
    };
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [issue, other],
            acceptedExceptions: [limitation],
            year: "2026",
            scope: { ids: [other.id], label: "Runway · 2025" },
            onClearScope: () => {},
            onOpen: () => {},
        }),
    );
    expect(html).toContain("Runway · 2025");
    expect(html).toContain("Show all checks");
    expect(html).not.toContain("Known limitations");
    expect(html).toContain("1 open checks");
    expect(html).toContain("other-vendor");
    expect(html).not.toContain("Historical receipt unavailable.");
    expect(html).not.toContain(">aws<");
});

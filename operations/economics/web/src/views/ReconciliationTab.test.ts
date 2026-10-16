import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { ReconciliationIssue } from "../lib/reconciliation";
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
    expect(html).toContain("2 items");
    expect(html).toContain("aws");
    expect(html).toContain("azure");
    expect(html).toContain("Inference");
    expect(html).toContain("Trends");
    expect(html).toContain("impact unknown");
    expect(html).not.toContain("All months");
    expect(html).toContain("<table");
    expect(html).toContain("Unresolved amount");
    expect(html).toContain('aria-sort="none"');
    expect(html).not.toContain("prior-year");
    expect(html).toContain("August");
    expect(html).toContain("September");
    expect(html).toContain('scope="rowgroup"');
    expect(html).toContain("Missing figures");
    expect(html).toContain("Documents");
    expect(html.match(/>aws</g)).toHaveLength(1);
    expect(html).not.toContain("Expected billing");
    expect(html).not.toContain("<details");
});

it("filters by both the selected year and affected page", () => {
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
            initialPage: "runway",
            onOpen: () => {},
        }),
    );
    expect(html).toContain("gaswerk");
    expect(html).not.toContain("azure");
    expect(html).not.toContain("aws");
    expect(html).not.toContain("2025-08");
    expect(html).toContain("1 item");
});

it("leaves unknown amounts blank while retaining a known zero", () => {
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
    expect(html).toContain("$0");
    expect(html).toContain("Verified zero");
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
    expect(html).toContain("2 items");
    expect(html).toContain("Could change totals");
    expect(html).toContain("Recorded amounts · validate");
    expect(html).toContain("Model/GPU breakdown");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("mixed-financial");
    expect(html).not.toContain("details-only");
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
    expect(html).toContain("1 items");
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

it("sorts unresolved amounts across issue types and keeps unknowns explicit", () => {
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [
                {
                    ...issue,
                    id: "small",
                    vendor: "small-gap",
                    amountUsd: 5,
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
                    amountUsd: 500,
                    types: ["forecast"],
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

it("keeps the overview across issue groups while respecting year and affected page", () => {
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
            year: "2026",
            initialPage: "inference",
            onOpen: () => {},
        }),
    );
    const overview = html
        .split('aria-label="Reconciliation overview"')[1]
        .split("</section>")[0];
    expect(overview).toContain("Incomplete");
    expect(overview).toContain("3 open checks");
    expect(overview).toContain("Financial gaps");
    expect(overview).toContain("1 with unknown amounts");
    expect(overview).toContain("Amounts to validate");
    expect(overview).toContain("Model/GPU details");
    expect(overview).not.toContain("$");
    expect(overview).not.toContain("%");
    expect(html.indexOf('aria-label="Reconciliation overview"')).toBeLessThan(
        html.indexOf('aria-label="Reconciliation sections"'),
    );
});

it("reports no flagged issues without claiming a fully verified close", () => {
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [],
            year: "2026",
            onOpen: () => {},
        }),
    );
    expect(html).toContain("No flagged issues");
    expect(html).toContain("0 open checks");
    expect(html).not.toContain("100%");
    expect(html).not.toContain("Fully reconciled");
});

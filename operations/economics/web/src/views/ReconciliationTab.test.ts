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
    expect(html).toContain("Related amount");
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
    expect(html).not.toContain("Unknown impact");
    expect(html).toContain("$0");
    expect(html).toContain("Verified zero");
});

it("keeps expected billing separate from issue counts and scopes it to the year", () => {
    const html = renderToStaticMarkup(
        createElement(ReconciliationTab, {
            issues: [issue],
            year: "2026",
            pending: [
                "google: 2026-10 estimated $700",
                "google: 2027-01 estimated $900",
            ],
            onOpen: () => {},
        }),
    );
    expect(html).toContain("1 items");
    expect(html).toContain("Expected billing");
    expect(html).toContain("estimated $700");
    expect(html).not.toContain("estimated $900");
    expect(html).not.toContain("<details open");
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

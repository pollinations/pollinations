import { describe, expect, it } from "vitest";
import type {
    Data,
    OpPollenRow,
    StripeSalesRow,
    VendorLedgerRow,
} from "../types";
import { parsePrivateConfig } from "./pipeContracts";
import { missingUsageCosts, reconciliationState } from "./reconciliation";
import { monthlyTrends } from "./trends";
import { unitEconomicsReport } from "./unitEconomics";

const now = new Date("2026-10-14T12:00:00Z");
const usage = (vendor: string): OpPollenRow => ({
    month: "2026-09",
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
const cost = (vendor: string, type = "inference"): VendorLedgerRow => ({
    entry_id: vendor,
    source: "dashboard",
    vendor,
    type,
    start: "2026-09-01T00:00:00Z",
    end: "2026-10-01T00:00:00Z",
    paid: -50,
    credit: 0,
    currency: "USD",
    resource_id: "usage",
    resource_name: "Usage",
    resource_sku: "tokens",
    resource_count: 1,
    model: "model",
    evidence: "https://drive.google.com/file/d/source/view",
    recorded_at: "2026-10-14 00:00:00",
});

describe("shared reconciliation", () => {
    it("does not request partial current-month usage to build a monthly plan", () => {
        const data: Data = {
            vendorLedger: [
                cost("replicate"),
                {
                    ...cost("replicate"),
                    entry_id: "balance",
                    type: "balance",
                    start: "2026-10-05 00:00:00",
                    end: "",
                    paid: 100,
                    resource_sku: "current-balance",
                },
            ],
        };
        const state = reconciliationState(data, now);
        const gaps = state.issues.filter((row) =>
            row.messages.some((message) =>
                message.includes("usage before the 2026-10-05 balance"),
            ),
        );
        expect(gaps).toHaveLength(0);
    });
    it("derives GPU mapping gaps from the ledgers and clears them when matched", () => {
        const data: Data = {
            opPollen: [
                { ...usage("vast"), model: "black-forest-labs/flux.1-schnell" },
            ],
            vendorLedger: [
                {
                    ...cost("vast", "gpu"),
                    model: "unknown-workload",
                    resource_sku: "gpu-hours",
                },
            ],
        };
        const gpuIssue = reconciliationState(data, now).issues.find(
            (row) => row.vendor === "vast" && row.month === "2026-09",
        );
        expect(gpuIssue?.affects).toContain("gpu");
        expect(gpuIssue?.messages).toContain(
            "GPU usage has no matching resource cost: black-forest-labs/flux.1-schnell.",
        );
        expect(gpuIssue?.messages).toContain(
            "GPU resource costs have no matching Pollen usage: unknown-workload.",
        );
        const resolved = reconciliationState(
            {
                ...data,
                vendorLedger: [
                    {
                        ...cost("vast", "gpu"),
                        model: "flux",
                        resource_sku: "gpu-hours",
                    },
                ],
            },
            now,
        ).issues.filter(
            (row) => row.vendor === "vast" && row.month === "2026-09",
        );
        expect(
            resolved
                .flatMap((row) => row.messages)
                .filter((message) => message.startsWith("GPU")),
        ).toEqual([]);
    });

    it("accepts recorded infrastructure usage but never a balance or grant as monthly cost", () => {
        const data: Data = {
            opPollen: [usage("exa"), usage("aws"), usage("azure")],
            vendorLedger: [
                cost("exa", "infra"),
                cost("aws", "balance"),
                { ...cost("azure"), paid: 0, credit: 1000 },
            ],
        };
        expect(missingUsageCosts(data).map((r) => r.vendor)).toEqual([
            "aws",
            "azure",
        ]);
        for (const scope of ["product", "company"] as const) {
            const month = monthlyTrends(data, scope, now).months.find(
                (r) => r.month === "2026-09",
            );
            expect(month?.issues.join(" ")).not.toContain("exa");
            expect(month?.issues.join(" ")).toContain("aws");
        }
    });
    it("keeps missing infrastructure costs visible in Product and company trends", () => {
        const data: Data = {
            opPollen: [usage("cloudflare")],
            vendorLedger: [cost("google")],
        };
        const product = monthlyTrends(data, "product", now).months.find(
            (r) => r.month === "2026-09",
        );
        const company = monthlyTrends(data, "company", now).months.find(
            (r) => r.month === "2026-09",
        );
        expect(product?.costIncomplete).toBe(true);
        expect(company?.costIncomplete).toBe(true);
    });
    it("deduplicates provider gaps, preserves unknown impact and identifies affected pages", () => {
        const state = reconciliationState(
            { opPollen: [usage("aws"), { ...usage("azure"), cost_paid: 200 }] },
            now,
        );
        const aws = state.issues.filter(
            (r) => r.vendor === "aws" && r.month === "2026-09",
        );
        expect(aws).toHaveLength(1);
        expect(aws[0].affects).toEqual(
            expect.arrayContaining(["inference", "trends", "runway"]),
        );
        expect(aws[0].amountLabel).toContain("impact unknown");
        expect(
            state.issues.findIndex((r) => r.vendor === "azure"),
        ).toBeLessThan(state.issues.findIndex((r) => r.vendor === "aws"));
    });
    it("keeps a missing bank document and missing Retell usage in one item", () => {
        const state = reconciliationState(
            {
                opTransactions: [
                    {
                        entry_id: "retell-bank",
                        kind: "transaction",
                        source: "wise",
                        date: "2026-09-29",
                        vendor: "retell",
                        category: "compute",
                        amount: -7.44,
                        currency: "USD",
                        description: "Retell",
                        evidence: "",
                        recorded_at: "2026-10-14 00:00:00",
                    },
                ],
            },
            now,
        );
        const rows = state.issues.filter(
            (r) => r.vendor === "retell" && r.month === "2026-09",
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].amountUsd).toBe(7.44);
        expect(rows[0].types).toEqual(["figures", "documents"]);
        expect(rows[0].messages).toEqual(
            expect.arrayContaining([
                "Bank payment recorded; invoice or service-month usage is missing.",
                "Bank transaction document is missing or not linked.",
            ]),
        );
    });
    it("keeps a retained invoice's unpaid balance open without claiming the document is missing", () => {
        const state = reconciliationState(
            {
                opTransactions: [
                    {
                        entry_id: "rent-bank",
                        kind: "transaction",
                        source: "wise",
                        date: "2026-07-08",
                        vendor: "gaswerksiedlung",
                        category: "office",
                        amount: -1166.83,
                        currency: "EUR",
                        description: "Studio rent",
                        evidence:
                            "evidence_type=supplier_document invoice=GWS-JUNE https://drive.google.com/file/d/invoice/view; EUR47.78 underpayment unresolved",
                        recorded_at: "2026-10-14 00:00:00",
                    },
                ],
            },
            now,
        );
        const issue = state.issues.find(
            (r) => r.vendor === "gaswerksiedlung" && r.month === "2026-07",
        );
        expect(issue?.types).toEqual(["quality"]);
        expect(issue?.messages).toContain(
            "Invoice retained; payment or balance still needs reconciliation.",
        );
        expect(issue?.messages).not.toContain(
            "Bank transaction document is missing or not linked.",
        );
        expect(issue?.invoices).toContain(
            "https://drive.google.com/file/d/invoice/view",
        );
    });
    it.each([
        "https://drive.google.com/file/d/linked-original/view",
        "evidence_type=payment_statement https://drive.google.com/file/d/statement/view",
    ])(
        "distinguishes linked sources from a validated supplier invoice: %s",
        (evidence) => {
            const state = reconciliationState(
                {
                    opTransactions: [
                        {
                            entry_id: "linked-bank",
                            kind: "transaction",
                            source: "wise",
                            date: "2026-09-08",
                            vendor: "buffer",
                            category: "operations",
                            amount: -24,
                            currency: "USD",
                            description: "Buffer",
                            evidence,
                            recorded_at: "2026-10-14 00:00:00",
                        },
                    ],
                },
                now,
            );
            const issue = state.issues.find(
                (row) => row.vendor === "buffer" && row.month === "2026-09",
            );
            expect(issue?.types).toEqual(["documents"]);
            expect(issue?.messages).toEqual([
                "A source is linked; validate the supplier invoice and its payment match.",
            ]);
            expect(issue?.evidence).toContain(evidence);
            expect(issue?.invoices).toBeUndefined();
        },
    );
    it("shows the reviewed historical meter limitation instead of requesting the same invoice again", () => {
        const explanation =
            "Search fees were absent from the historical internal meter. Provider invoices remain the cost source.";
        const source =
            "https://drive.google.com/file/d/reviewed-meter-audit/view";
        const data: Data = {
            opPollen: [usage("perplexity")],
            vendorLedger: [{ ...cost("perplexity"), paid: -500 }],
            privateConfig: parsePrivateConfig({
                config: JSON.stringify({
                    forecastRules: {},
                    reviewNotes: {
                        providerCheckExplanations: [],
                        pollenWitnessExplanations: [],
                        meterDriftExplanations: [
                            {
                                month: "2026-09",
                                provider: "perplexity",
                                reason: "historical_tracking_gap",
                                explanation,
                                evidence: [source],
                            },
                        ],
                    },
                }),
                recorded_at: "2026-10-15 00:00:00",
            }),
        };
        const issue = reconciliationState(data, now).issues.find(
            (row) => row.vendor === "perplexity" && row.month === "2026-09",
        );
        expect(issue?.messages).toContain(
            `Known historical meter gap: ${explanation}`,
        );
        expect(issue?.evidence).toContain(source);
        expect(
            issue?.messages.some((message) =>
                message.includes("Check the usage and invoice records"),
            ),
        ).toBe(false);
        expect(issue?.amountUsd).toBe(430);
        expect(issue?.group).toBe("validation");
        expect(monthlyTrends(data, "company", now)).toEqual(
            monthlyTrends(
                { ...data, privateConfig: undefined },
                "company",
                now,
            ),
        );
    });

    it("does not call the current month missing full-month usage", () => {
        const state = reconciliationState(
            { opPollen: [{ ...usage("aws"), month: "2026-10" }] },
            now,
        );
        expect(
            state.issues.some(
                (r) =>
                    r.vendor === "aws" &&
                    r.messages.some((m) => m.startsWith("Monthly usage costs")),
            ),
        ).toBe(false);
    });
});

describe("source invoice comparisons", () => {
    const statement: VendorLedgerRow = {
        ...cost("aws", "statement"),
        entry_id: "invoice",
        resource_name: "Invoice credits",
        paid: 0,
        statement_amount: 62.5,
        compared_entry_ids: ["aws"],
        comparison_basis: "cost",
        comparison_month: "2026-09",
    };
    it("derives the difference without changing results and clears it when source records agree", () => {
        const before: Data = {
            opPollen: [usage("aws")],
            vendorLedger: [cost("aws", "infra")],
        };
        const data: Data = { ...before, vendorStatements: [statement] };
        const issue = reconciliationState(data, now).issues.find(
            (r) => r.vendor === "aws",
        );
        expect(issue?.amountUsd).toBe(12.5);
        expect(issue?.amountLabel).toBe(
            "Source difference · not included in costs",
        );
        expect(issue?.affects).toEqual(
            expect.arrayContaining(["trends", "runway", "inference"]),
        );
        expect(monthlyTrends(data, "company", now)).toEqual(
            monthlyTrends(before, "company", now),
        );
        if (!data.vendorLedger) throw new Error("Missing fixture");
        data.vendorLedger[0].paid = -62.5;
        expect(
            reconciliationState(data, now)
                .issues.flatMap((r) => r.messages)
                .some((m) => m.startsWith("Invoice credits:")),
        ).toBe(false);
    });
    it("keeps missing linked figures unknown and source-only periods out of cost coverage", () => {
        const data: Data = {
            vendorStatements: [statement],
            opPollen: [usage("aws")],
        };
        expect(missingUsageCosts(data)).toHaveLength(1);
        const issue = reconciliationState(data, now).issues.find(
            (r) => r.vendor === "aws",
        );
        expect(issue?.relatedAmounts).toContainEqual({
            amountUsd: null,
            amountLabel: "Impact unknown",
            group: "financial",
        });
        expect(
            issue?.messages.some((m) =>
                m.includes("linked source records are missing"),
            ),
        ).toBe(true);
    });
    it("rejects saved financial differences in notes", () => {
        expect(() =>
            parsePrivateConfig({
                config: JSON.stringify({
                    forecastRules: {},
                    reviewNotes: {
                        providerCheckExplanations: [],
                        meterDriftExplanations: [],
                        pollenWitnessExplanations: [],
                        costDifferences: [],
                    },
                }),
                recorded_at: "2026-10-16",
            }),
        ).toThrow("invalid shape");
    });
});

describe("Drive archive observations", () => {
    const check = {
        month: "2026-09",
        provider: "aws-bedrock",
        account: "payer",
        checkedAt: "2026-10-15T12:00:00Z",
        status: "found",
        note: "Usage export archived; invoice match still needs review.",
        evidence: ["https://drive.google.com/file/d/usage-export/view"],
    };
    const parse = (checks: unknown) =>
        parsePrivateConfig({
            recorded_at: "2026-10-15 12:00:00",
            config: JSON.stringify({
                forecastRules: {},
                reviewNotes: {
                    providerCheckExplanations: [],
                    meterDriftExplanations: [],
                    pollenWitnessExplanations: [],
                    archiveChecks: checks,
                },
            }),
        });
    it("annotates only the matching open month without changing costs, counts or coverage", () => {
        const before: Data = { opPollen: [usage("aws")] };
        const after: Data = { ...before, privateConfig: parse([check]) };
        const previous = reconciliationState(before, now);
        const updated = reconciliationState(after, now);
        expect(
            updated.issues.map(({ archiveChecks, ...issue }) => issue),
        ).toEqual(previous.issues);
        expect(
            updated.issues.find((r) => r.id === "2026-09|aws")
                ?.archiveChecks?.[0].provider,
        ).toBe("aws");
        expect(missingUsageCosts(after)).toEqual(missingUsageCosts(before));
        expect(monthlyTrends(after, "company", now)).toEqual(
            monthlyTrends(before, "company", now),
        );
        expect(
            updated.issues
                .filter((r) => r.id !== "2026-09|aws")
                .every((r) => !r.archiveChecks),
        ).toBe(true);
        const resolved: Data = {
            ...after,
            vendorLedger: [cost("aws", "infra")],
        };
        expect(
            reconciliationState(resolved, now).issues.map(
                ({ archiveChecks, ...issue }) => issue,
            ),
        ).toEqual(
            reconciliationState({ ...resolved, privateConfig: undefined }, now)
                .issues,
        );
    });
    it("rejects found evidence without retained files and malformed checks", () => {
        for (const override of [
            { evidence: [] },
            { evidence: ["https://drive.google.com/drive/folders/folder"] },
            { status: "verified" },
            { month: "2026-13" },
            { checkedAt: "unknown" },
            { account: "" },
            { note: "" },
        ])
            expect(() => parse([{ ...check, ...override }])).toThrow(
                "invalid archive checks",
            );
        expect(
            parse([{ ...check, status: "blocked", evidence: [] }]).reviewNotes
                .archiveChecks,
        ).toHaveLength(1);
    });
});

it("never infers an original invoice from the ledger collection method", () => {
    const data: Data = {
        opPollen: [usage("aws")],
        vendorLedger: [
            {
                ...cost("aws", "balance"),
                source: "invoice",
                evidence:
                    "https://drive.google.com/file/d/extracted-json-report/view",
            },
        ],
    };
    for (const issue of reconciliationState(data, now).issues) {
        expect(issue.invoices ?? []).not.toContain(
            "https://drive.google.com/file/d/extracted-json-report/view",
        );
    }
});

describe("Sales ledger reconciliation", () => {
    const sales: StripeSalesRow = {
        month: "2026-09",
        revenue_stream: "pollen",
        currency: "USD",
        gross_sales: 100,
        refunds: 10,
        reversals: 5,
        stripe_fees: 3,
        dispute_fees: 0,
        net_sales: 85,
        net_after_fees: 82,
        payments: 2,
        refund_count: 1,
        coverage_complete: 1,
    };
    const issues = (rows: StripeSalesRow[]) =>
        reconciliationState({ stripeSales: rows }, now).issues.filter(
            (issue) => issue.vendor === "Stripe",
        );
    it("links missing and unverified closed-month sales to Trends and Runway", () => {
        const missing = issues([]).find((issue) => issue.month === "2026-09");
        expect(missing?.messages).toEqual([
            "Calendar-month sales are missing.",
        ]);
        expect(missing?.affects).toEqual(["trends", "runway"]);
        const unverified = issues([
            sales,
            { ...sales, currency: "EUR", coverage_complete: undefined },
        ]).find((issue) => issue.month === "2026-09");
        expect(unverified?.messages).toEqual([
            "Calendar-month sales coverage is not confirmed complete.",
        ]);
        expect(unverified?.amountUsd).toBeNull();
    });
    it("clears the issue on complete coverage, including confirmed zero activity, without flagging the open month", () => {
        expect(issues([sales]).some((issue) => issue.month === "2026-09")).toBe(
            false,
        );
        expect(
            issues([
                {
                    ...sales,
                    gross_sales: 0,
                    refunds: 0,
                    reversals: 0,
                    stripe_fees: 0,
                    dispute_fees: 0,
                    net_sales: 0,
                    net_after_fees: 0,
                    payments: 0,
                    refund_count: 0,
                },
            ]).some((issue) => issue.month === "2026-09"),
        ).toBe(false);
        expect(issues([]).some((issue) => issue.month >= "2026-10")).toBe(
            false,
        );
    });
});

it("shows an explicitly verified archived invoice while retaining the cost gap", () => {
    const invoice = "https://drive.google.com/file/d/original-invoice/view";
    const data: Data = {
        opPollen: [usage("aws")],
        privateConfig: parsePrivateConfig({
            recorded_at: "2026-10-15 12:00:00",
            config: JSON.stringify({
                forecastRules: {},
                reviewNotes: {
                    providerCheckExplanations: [],
                    meterDriftExplanations: [],
                    pollenWitnessExplanations: [],
                    archiveChecks: [
                        {
                            month: "2026-09",
                            provider: "aws",
                            account: "payer",
                            checkedAt: "2026-10-15T12:00:00Z",
                            status: "found",
                            note: "Invoice match needs review.",
                            evidence: [
                                `evidence_type=supplier_document invoice=INV-ONE ${invoice}`,
                                "https://drive.google.com/file/d/usage-json/view",
                            ],
                        },
                    ],
                },
            }),
        }),
    };
    const issue = reconciliationState(data, now).issues.find(
        (r) => r.id === "2026-09|aws",
    );
    expect(issue?.invoices).toEqual([invoice]);
    expect(missingUsageCosts(data).some((r) => r.vendor === "aws")).toBe(true);
});

describe("centralized account and cost checks", () => {
    it("clears stale balance and unknown expiry messages after recording a current approved snapshot", () => {
        const snapshot = {
            ...cost("aws", "balance"),
            paid: 0,
            credit: 100,
            end: "",
            resource_sku: "current-balance",
        };
        const messages = (row: VendorLedgerRow) =>
            reconciliationState({ vendorLedger: [row] }, now)
                .issues.filter(
                    (issue) =>
                        issue.vendor === "aws" && issue.month === "2026-10",
                )
                .flatMap((issue) => issue.messages)
                .join(" ");
        expect(messages(snapshot)).toContain(
            "refresh the outdated balance snapshot",
        );
        expect(messages(snapshot)).toContain("confirm the credit expiry");
        const resolved = messages({
            ...snapshot,
            start: "2026-10-14",
            resource_sku: "current-balance-expiry-assumed",
        });
        expect(resolved).not.toContain("refresh the outdated balance snapshot");
        expect(resolved).not.toContain("confirm the credit expiry");
    });

    it("moves material provider/meter differences to reconciliation and clears them when matched", () => {
        const issues = (paid: number) =>
            reconciliationState(
                {
                    opPollen: [usage("replicate")],
                    vendorLedger: [{ ...cost("replicate"), paid }],
                },
                now,
            ).issues.filter(
                (issue) =>
                    issue.vendor === "replicate" && issue.month === "2026-09",
            );
        const mismatch = issues(-500).find((issue) =>
            issue.messages.some((message) =>
                message.includes("Pollen cost meter differ"),
            ),
        );
        expect(mismatch?.affects).toContain("inference");
        expect(mismatch?.amountUsd).toBe(430);
        expect(
            issues(-70)
                .flatMap((issue) => issue.messages)
                .join(" "),
        ).not.toContain("Pollen cost meter differ");
    });
});

it("exposes the exact result blockers once, separately from model and document cleanup", () => {
    const data: Data = {
        vendorLedger: [
            { ...cost("openai"), paid: -0.66, model: "unknown-name" },
        ],
    };
    const check = unitEconomicsReport(data, "2026-09", "inference");
    const issue = reconciliationState(data, now).issues.find(
        (row) => row.vendor === "openai" && row.month === "2026-09",
    );
    expect(issue?.types).toContain("totals");
    expect(issue?.blockingMessages).toEqual(
        check.blockers.map((b) => b.message),
    );
    expect(issue?.affects).toEqual(
        expect.arrayContaining(["inference", "vendors"]),
    );
    expect(
        issue?.messages.filter(
            (message) => message === check.blockers[0].message,
        ),
    ).toHaveLength(1);
    const resolved = {
        ...data,
        opPollen: [
            {
                ...usage("openai"),
                price_paid: 0,
                cost_paid: 0,
                requests_paid: 0,
            },
        ],
    };
    expect(
        unitEconomicsReport(resolved, "2026-09", "inference").fullCostResultUsd,
    ).toBe(-0.66);
    const remaining = reconciliationState(resolved, now).issues.find(
        (row) => row.vendor === "openai" && row.month === "2026-09",
    );
    expect(remaining?.types).not.toContain("totals");
    expect(remaining?.types).toContain("models");
});

it("keeps missing usage in reconciliation when recorded-figures results are provisional", () => {
    const data: Data = {
        vendorLedger: [cost("google"), { ...cost("openai"), paid: -0.19 }],
        opPollen: [usage("google")],
    };
    const report = unitEconomicsReport(data, "2026-09", "inference");
    expect(report.provisional).toBe(true);
    const issue = reconciliationState(data, now).issues.find(
        (row) => row.vendor === "openai" && row.month === "2026-09",
    );
    expect(issue?.types).toContain("provisional");
    expect(issue?.types).not.toContain("totals");
    expect(issue?.messages).toContain(report.blockers[0].message);
    expect(issue?.blockingMessages).toBeUndefined();
});

it("does not request current-month actuals while keeping closed-month financial gaps", () => {
    const issues = reconciliationState(
        { opPollen: [usage("aws"), { ...usage("aws"), month: "2026-10" }] },
        now,
    ).issues;
    expect(issues.find((row) => row.id === "2026-09|aws")?.types).toContain(
        "figures",
    );
    expect(
        issues
            .filter((row) => row.month === "2026-10")
            .some(
                (row) =>
                    row.types.includes("totals") ||
                    row.types.includes("provisional"),
            ),
    ).toBe(false);
});

it("distinguishes missing money from recorded usage and model validation", () => {
    const missing = reconciliationState(
        { opPollen: [usage("perplexity")] },
        now,
    ).issues.find((row) => row.id === "2026-09|perplexity");
    expect(missing).toMatchObject({ group: "financial", amountUsd: 70 });
    const recorded = reconciliationState(
        { vendorLedger: [cost("openai")] },
        now,
    ).issues.find((row) => row.id === "2026-09|openai");
    expect(recorded).toMatchObject({
        group: "validation",
        amountUsd: 50,
        amountLabel: "Recorded cost · usage unknown",
    });
    const unmapped = reconciliationState(
        { vendorLedger: [cost("azure")], opPollen: [usage("azure")] },
        now,
    ).issues.find((row) => row.id === "2026-09|azure");
    expect(unmapped?.group).toBe("models");
});

it("keeps unknown financial exposure when a recorded-cost validation shares its row", () => {
    const issue = reconciliationState(
        {
            vendorLedger: [
                { ...cost("modal"), account_id: "myceli-ai", paid: -100 },
            ],
        },
        now,
    ).issues.find((row) => row.id === "2026-09|modal");
    expect(issue).toMatchObject({
        group: "financial",
        amountUsd: null,
        amountLabel: "Impact unknown",
    });
    expect(issue?.messages.some((message) => message.includes("$100"))).toBe(
        true,
    );
});

it("keeps accepted historical detail gaps neutral without suppressing financial differences", () => {
    const data: Data = {
        vendorLedger: [
            {
                ...cost("pruna"),
                start: "2026-03-01T00:00:00Z",
                end: "2026-04-01T00:00:00Z",
                model: "unrecoverable-label",
            },
        ],
        opPollen: [
            {
                ...usage("pruna"),
                month: "2026-03",
                model: "black-forest-labs/flux.1-schnell",
                cost_paid: 50,
            },
        ],
        privateConfig: {
            forecastRules: {},
            reviewNotes: {
                providerCheckExplanations: [
                    {
                        month: "2026-03",
                        provider: "pruna",
                        reason: "unverifiable_history",
                        decision: "known_limitation",
                        explanation: "Historical source cannot be recovered.",
                        evidence: [],
                    },
                ],
                pollenWitnessExplanations: [],
                meterDriftExplanations: [],
            },
        },
    };
    const state = reconciliationState(data, now);
    expect(state.issues.filter((issue) => issue.vendor === "pruna")).toEqual(
        [],
    );
    expect(
        state.acceptedExceptions.some((issue) => issue.vendor === "pruna"),
    ).toBe(true);
    const withDifference = reconciliationState(
        {
            ...data,
            vendorStatements: [
                {
                    ...cost("pruna", "statement"),
                    entry_id: "pruna-source-total",
                    paid: 0,
                    statement_amount: 55,
                    compared_entry_ids: ["pruna"],
                    comparison_basis: "cost",
                    comparison_month: "2026-03",
                },
            ],
        },
        now,
    );
    expect(
        withDifference.issues.find((issue) => issue.vendor === "pruna")
            ?.amountUsd,
    ).toBe(5);
    expect(unitEconomicsReport(data, "2026-03", "inference").summary).toEqual(
        unitEconomicsReport(
            { ...data, privateConfig: undefined },
            "2026-03",
            "inference",
        ).summary,
    );
});

it("flags unsupported recurring forecasts without booking them as expenses", () => {
    const plan: VendorLedgerRow = {
        ...cost("test-budget", "planned"),
        entry_id: "budget",
        start: "2026-10",
        end: "",
        paid: 0,
        credit: 0,
        plan_amount: -123.45,
        plan_category: "development",
        plan_cadence: "monthly",
        settled_by_entry_ids: [],
    };
    const config = parsePrivateConfig({
        config: JSON.stringify({
            forecastRules: {},
            reviewNotes: {
                providerCheckExplanations: [],
                meterDriftExplanations: [],
                pollenWitnessExplanations: [],
            },
        }),
        recorded_at: "2026-10-14",
    });
    const data: Data = {
        vendorLedger: [],
        opTransactions: [],
        vendorPlans: [plan],
        privateConfig: config,
    };
    const before = structuredClone(data);
    const issue = reconciliationState(data, now).issues.find(
        (row) => row.vendor === "test-budget" && row.month === "2026-10",
    );
    expect(issue?.messages.join(" ")).toContain(
        "has no supporting review note",
    );
    expect(issue?.group).toBe("validation");
    expect(issue?.amountUsd).toBeNull();
    expect(issue?.messages.join(" ")).not.toContain("123.45");
    expect(data).toEqual(before);
    config.reviewNotes.planNotes = [
        {
            entryId: "budget",
            explanation: "Reviewed monthly budget assumption.",
        },
    ];
    expect(
        reconciliationState(data, now).issues.some((row) =>
            row.messages.some((message) =>
                message.includes("has no supporting review note"),
            ),
        ),
    ).toBe(false);
});

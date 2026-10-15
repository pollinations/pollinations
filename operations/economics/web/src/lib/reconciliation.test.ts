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

describe("reviewed invoice differences", () => {
    const config = {
        forecastRules: {},
        reconciliation: {
            providerCheckExplanations: [],
            meterDriftExplanations: [],
            pollenWitnessExplanations: [],
            costDifferences: [
                {
                    month: "2026-09",
                    provider: "aws-bedrock",
                    amountUsd: 12.5,
                    explanation:
                        "Invoice credits exceed the recorded net usage costs.",
                    evidence: ["https://example.com/invoice"],
                },
            ],
        },
    };
    it("keeps a source difference open after usage is imported, without adding it to results", () => {
        const before: Data = {
            opPollen: [usage("aws")],
            vendorLedger: [cost("aws", "infra")],
        };
        const data = {
            ...before,
            privateConfig: parsePrivateConfig({
                config: JSON.stringify(config),
                recorded_at: "2026-10-15 00:00:00",
            }),
        };
        expect(missingUsageCosts(data)).toEqual([]);
        const issue = reconciliationState(data, now).issues.find(
            (r) => r.vendor === "aws" && r.month === "2026-09",
        );
        expect(issue?.messages).toContain(
            config.reconciliation.costDifferences[0].explanation,
        );
        expect(issue?.amountUsd).toBe(12.5);
        expect(issue?.amountLabel).toBe(
            "Invoice difference · not included in costs",
        );
        expect(issue?.affects).toEqual(
            expect.arrayContaining(["trends", "runway", "inference"]),
        );
        expect(monthlyTrends(data, "company", now)).toEqual(
            monthlyTrends(before, "company", now),
        );
        data.privateConfig.reconciliation.costDifferences = [];
        expect(
            reconciliationState(data, now).issues.flatMap((r) => r.messages),
        ).not.toContain(config.reconciliation.costDifferences[0].explanation);
    });
    it("displays a funding difference with its reviewed label", () => {
        const reviewed = {
            ...config,
            reconciliation: {
                ...config.reconciliation,
                costDifferences: config.reconciliation.costDifferences.map(
                    (item) => ({
                        ...item,
                        amountLabel: "Funding difference · allocation pending",
                    }),
                ),
            },
        };
        const privateConfig = parsePrivateConfig({
            config: JSON.stringify(reviewed),
            recorded_at: "2026-10-15 00:00:00",
        });
        const issue = reconciliationState({ privateConfig }, now).issues.find(
            (row) => row.vendor === "aws",
        );
        expect(issue?.amountLabel).toBe(
            "Funding difference · allocation pending",
        );
    });
    it("rejects a non-text source-difference label", () => {
        const invalid = {
            ...config,
            reconciliation: {
                ...config.reconciliation,
                costDifferences: [
                    {
                        ...config.reconciliation.costDifferences[0],
                        amountLabel: 123,
                    },
                ],
            },
        };
        expect(() =>
            parsePrivateConfig({
                config: JSON.stringify(invalid),
                recorded_at: "2026-10-15 00:00:00",
            }),
        ).toThrow("invalid cost differences");
    });
    it("rejects an invalid difference amount before displaying it", () => {
        const invalid = structuredClone(config);
        invalid.reconciliation.costDifferences[0].amountUsd = -1;
        expect(() =>
            parsePrivateConfig({
                config: JSON.stringify(invalid),
                recorded_at: "2026-10-15 00:00:00",
            }),
        ).toThrow("invalid cost differences");
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
                reconciliation: {
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
            parse([{ ...check, status: "blocked", evidence: [] }])
                .reconciliation.archiveChecks,
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
    expect(
        reconciliationState(data, now).issues.every(
            (issue) =>
                !issue.invoices?.includes(
                    "https://drive.google.com/file/d/extracted-json-report/view",
                ),
        ),
    ).toBe(true);
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
        net_sales: 85,
        net_after_fees: 82,
        payments: 2,
        refund_count: 1,
        coverage_complete: 1,
    };
    const issues = (rows: StripeSalesRow[]) =>
        reconciliationState({ stripeSales: rows }, now).issues.filter((issue) =>
            issue.affects.includes("sales"),
        );
    it("links missing and unverified closed-month sales to Sales, Trends and Runway", () => {
        const missing = issues([]).find((issue) => issue.month === "2026-09");
        expect(missing?.messages).toEqual([
            "Calendar-month sales are missing.",
        ]);
        expect(missing?.affects).toEqual(["sales", "trends", "runway"]);
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
                reconciliation: {
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

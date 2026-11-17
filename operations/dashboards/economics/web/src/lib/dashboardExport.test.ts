import { expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import type { Data } from "../types";
import { dashboardExport, dashboardSectionExport } from "./dashboardExport";

it("exports all reporting months and aggregate values without source detail", () => {
    const data: Data = {
        opTransactions: [
            {
                entry_id: "private-bank-entry",
                kind: "transaction",
                source: "wise",
                date: "2026-10-12",
                vendor: "private-payee",
                category: "payroll",
                amount: -805,
                currency: "USD",
                description: "private-memo",
                evidence: "private-bank-evidence",
                recorded_at: "2026-10-12",
            },
        ],
        userBalances: [
            {
                users: 100,
                paid_users: 20,
                quest_users: 80,
                paid_balance: 400,
                quest_balance: 150,
                synced_at: "2026-11-01",
            },
        ],
        opPollen: FIXTURES.economics_pollen_usage_api as Data["opPollen"],
        revenueShare:
            FIXTURES.economics_revenue_share_api as Data["revenueShare"],
        planningError: "private-planning-error",
    };
    const now = new Date("2026-11-16T12:00:00Z");
    const report = dashboardExport(data, now);
    expect(report.trends.company.map(({ month }) => month)).toHaveLength(11);
    expect(
        report.runway.categories.find(({ category }) => category === "payroll"),
    ).toMatchObject({ values: { "2026-10:actual": -805 } });
    expect(report.runway.columns.every(({ kind }) => kind === "actual")).toBe(
        true,
    );
    expect(report.runway.pollenBalance).toEqual({
        asOf: "2026-11-01",
        paidPollen: 400,
        questPollen: 150,
    });
    expect(
        report.revenueShare.find(({ month }) => month === "2026-07")?.summary,
    ).not.toBeNull();
    const providerRows = report.providers.months.flatMap(({ rows }) => rows);
    expect(providerRows.length).toBeGreaterThan(0);
    expect(
        providerRows.every(
            (row) => row.length === report.providers.columns.length,
        ),
    ).toBe(true);
    const json = JSON.stringify(report);
    expect(json).not.toMatch(
        /private-|recipient_id|recipientId|access|evidence/,
    );
    const { schemaVersion, exportedAt, currency, nullMeans, tableFormat } =
        report;
    for (const section of [
        "runway",
        "trends",
        "vendorBalances",
        "providers",
        "inference",
        "infrastructure",
        "tools",
        "gpus",
        "revenueShare",
    ] as const) {
        expect(dashboardSectionExport(data, section, now)).toEqual({
            schemaVersion,
            exportedAt,
            currency,
            nullMeans,
            tableFormat,
            [section]: report[section],
        });
    }
});

it("combines historical development and operations in every report without changing expenses", () => {
    const bank = (category: string, amount: number) => ({
        entry_id: category,
        kind: "transaction" as const,
        source: "wise",
        date: "2026-10-12",
        vendor: `example-${category}`,
        category,
        amount,
        currency: "USD",
        description: "Subscription",
        evidence: "",
        recorded_at: "2026-10-12",
    });
    const data: Data = {
        opTransactions: [bank("development", -40), bank("operations", -30)],
    };
    const now = new Date("2026-11-16T12:00:00Z");
    const report = dashboardExport(data, now);
    expect(
        report.runway.categories.filter((row) => row.category === "operations"),
    ).toHaveLength(1);
    expect(
        report.runway.categories.find((row) => row.category === "operations")
            ?.values["2026-10:actual"],
    ).toBe(-70);
    expect(
        report.runway.columns.find((column) => column.id === "2026-10:actual")
            ?.totalExpensesUsd,
    ).toBe(-70);
    expect(
        report.trends.company.find((row) => row.month === "2026-10"),
    ).toMatchObject({ operations: 70, paidCost: 70 });
    expect(JSON.stringify(report)).not.toContain('"development"');
    expect(dashboardSectionExport(data, "runway", now)).toMatchObject({
        runway: report.runway,
    });
});

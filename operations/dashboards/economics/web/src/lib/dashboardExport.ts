import type { Data } from "../types";
import { infrastructureReport } from "./apiCosts";
import { providerMonthComputeMode } from "./computeModes";
import { gpuWorkloadRows, gpuWorkloadSummary } from "./gpu";
import { reportingMonths } from "./months";
import { monthlyProductMix } from "./productMix";
import { providerBalanceRows } from "./providerBalances";
import { reconciliationState } from "./reconciliation";
import { revenueShareSummary } from "./revenueShareEconomics";
import { buildRunway, groupRunwayRows } from "./runway";
import { toolUsageRows } from "./toolUsage";
import { monthlyPollenTrends, monthlyTrends } from "./trends";
import {
    providerEconomicsReport,
    type UnitEconomicsView,
    unitEconomicsReport,
    unitEconomicsRows,
} from "./unitEconomics";

// List the fields once so thousands of model rows stay compact in one file.
const UNIT_ECONOMICS_COLUMNS = [
    "vendor",
    "model",
    "computeMode",
    "paidPollenUsd",
    "questPollenUsd",
    "retainedPaidUsd",
    "providerCashUsd",
    "providerCreditUsd",
    "providerUsageUsd",
    "netCashContributionUsd",
    "economicContributionUsd",
    "sourceStatus",
    "allocationStatus",
] as const;

// Keep this file on the calculated side of the dashboard. Ledger rows, source
// evidence, account access details and individual balances never enter it.
function exportSections(data: Data, now: Date) {
    const months = reportingMonths(now);
    const unitEconomics = (view: UnitEconomicsView) => ({
        columns: UNIT_ECONOMICS_COLUMNS,
        months: months.map((month) => {
            const providers =
                view === "vendors"
                    ? providerEconomicsReport(data, month)
                    : null;
            const report = providers ?? unitEconomicsReport(data, month, view);
            const rows =
                providers?.rows ??
                unitEconomicsRows(report.vendorMonths, "model");
            return {
                month,
                summary: rows.length ? report.summary : null,
                provisional: report.provisional,
                currentResultUsd: report.currentResultUsd,
                fullCostResultUsd: report.fullCostResultUsd,
                rows: rows.map((row) =>
                    UNIT_ECONOMICS_COLUMNS.map((column) =>
                        column === "computeMode"
                            ? providerMonthComputeMode(
                                  report.modeIndex,
                                  month,
                                  row.vendor,
                              )
                            : row[column],
                    ),
                ),
                ...(providers && {
                    serviceCosts: [...providers.costsByVendor.values()].flat(),
                }),
            };
        }),
    });
    return {
        runway: () => {
            const runway = buildRunway(
                data.opTransactions ?? [],
                now,
                data.vendorLedger ?? [],
                data.privateConfig?.forecastRules,
                data.stripeSales ?? [],
                undefined,
                data.vendorStatements,
            );
            const columns = runway.columns.filter(
                (column) =>
                    column.kind !== "current" &&
                    (!data.planningError || column.kind !== "forecast"),
            );
            const balances = data.userBalances?.[0];
            return {
                columns,
                categories: groupRunwayRows(runway.rows, columns).map(
                    ({ category, values, creditValues }) => ({
                        category,
                        values,
                        creditValues,
                    }),
                ),
                recordedCashDate:
                    runway.latestTransactionDate ?? runway.openingBalanceDate,
                currentCashUsd: runway.currentCashUsd,
                projectedMonthEndCashUsd: data.planningError
                    ? null
                    : runway.projectedMonthEndCashUsd,
                runwayMonths: data.planningError ? null : runway.runwayMonths,
                runwayExhaustedMonth: data.planningError
                    ? null
                    : runway.runwayExhaustedMonth,
                runwayCapped: !data.planningError && runway.runwayCapped,
                fundingProvisional: runway.fundingProvisional,
                planningAvailable: !data.planningError,
                pollenBalance: balances
                    ? {
                          asOf: balances.synced_at,
                          paidPollen: balances.paid_balance,
                          questPollen: balances.quest_balance,
                      }
                    : null,
            };
        },
        trends: () => ({
            company: monthlyTrends(data, "company", now).months,
            product: monthlyTrends(data, "product", now).months,
            pollen: monthlyPollenTrends(data, months),
            paidProductMix: monthlyProductMix(data, months),
        }),
        providers: () => unitEconomics("vendors"),
        inference: () => unitEconomics("inference"),
        tools: () =>
            months.map((month) => ({
                ...infrastructureReport(data, month, "tools"),
                usage: toolUsageRows(data, month),
                costScope:
                    "Attributed vendor bills only. Shared Azure and Cloudflare costs remain in Infrastructure until resource attribution is verified.",
                usageBasis:
                    "Paid and Quest Pollen consumed, not Stripe cash sales.",
            })),
        infrastructure: () =>
            months.map((month) => infrastructureReport(data, month)),
        vendorBalances: () =>
            providerBalanceRows(data, now).map(
                ({ access, balanceNote, collectionMethod, ...row }) => row,
            ),
        gpus: () =>
            months.map((month) => {
                const rows = gpuWorkloadRows(data, month);
                return {
                    month,
                    summary: rows.length ? gpuWorkloadSummary(rows) : null,
                    workloads: rows.map(
                        ({ resources, flags, key, ...row }) => row,
                    ),
                };
            }),
        revenueShare: () =>
            months.map((month) => ({
                month,
                summary: data.revenueShare?.some(
                    (row) => row.month === month && row.row_type === "summary",
                )
                    ? revenueShareSummary(data, month)
                    : null,
            })),
        reconciliation: () => {
            const { issues, acceptedExceptions } = reconciliationState(
                data,
                now,
            );
            return months.map((month) => ({
                month,
                openChecks: issues.filter((issue) => issue.month === month)
                    .length,
                acceptedExceptions: acceptedExceptions.filter(
                    (exception) => exception.month === month,
                ).length,
            }));
        },
    };
}

export type DashboardExportSection = keyof ReturnType<typeof exportSections>;

function exportMetadata(now: Date) {
    return {
        schemaVersion: 1,
        exportedAt: now.toISOString(),
        currency: "USD",
        nullMeans: "Unavailable or not applicable.",
        tableFormat:
            "Each provider and inference row follows the columns listed in its section.",
    };
}

export function dashboardExport(data: Data, now = new Date()) {
    const sections = exportSections(data, now);
    return {
        ...exportMetadata(now),
        runway: sections.runway(),
        trends: sections.trends(),
        providers: sections.providers(),
        inference: sections.inference(),
        tools: sections.tools(),
        infrastructure: sections.infrastructure(),
        vendorBalances: sections.vendorBalances(),
        gpus: sections.gpus(),
        revenueShare: sections.revenueShare(),
        reconciliation: sections.reconciliation(),
    };
}

export function dashboardSectionExport(
    data: Data,
    section: DashboardExportSection,
    now = new Date(),
) {
    return {
        ...exportMetadata(now),
        [section]: exportSections(data, now)[section](),
    };
}

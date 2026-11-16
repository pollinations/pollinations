import type { Data } from "../types";
import { providerMonthComputeMode } from "./computeModes";
import { gpuWorkloadRows, gpuWorkloadSummary } from "./gpu";
import { reportingMonths } from "./months";
import { monthlyProductMix } from "./productMix";
import { providerBalanceRows } from "./providerBalances";
import { reconciliationState } from "./reconciliation";
import { revenueShareSummary } from "./revenueShareEconomics";
import { buildRunway, groupRunwayRows } from "./runway";
import { monthlyPollenTrends, monthlyTrends } from "./trends";
import {
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
export function dashboardExport(data: Data, now = new Date()) {
    const months = reportingMonths(now);
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
    const { issues, acceptedExceptions } = reconciliationState(data, now);
    const unitEconomics = (view: UnitEconomicsView) => ({
        columns: UNIT_ECONOMICS_COLUMNS,
        months: months.map((month) => {
            const report = unitEconomicsReport(data, month, view);
            const grain = view === "vendors" ? "provider" : "model";
            return {
                month,
                summary: report.vendorMonths.length ? report.summary : null,
                provisional: report.provisional,
                currentResultUsd: report.currentResultUsd,
                fullCostResultUsd: report.fullCostResultUsd,
                rows: unitEconomicsRows(report.vendorMonths, grain).map((row) =>
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
            };
        }),
    });
    return {
        schemaVersion: 1,
        exportedAt: now.toISOString(),
        currency: "USD",
        nullMeans: "Unavailable or not applicable.",
        tableFormat:
            "Each provider and inference row follows the columns listed in its section.",
        runway: {
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
        },
        trends: {
            company: monthlyTrends(data, "company", now).months,
            product: monthlyTrends(data, "product", now).months,
            pollen: monthlyPollenTrends(data, months),
            paidProductMix: monthlyProductMix(data, months),
        },
        providers: unitEconomics("vendors"),
        inference: unitEconomics("inference"),
        vendorBalances: providerBalanceRows(data, now).map(
            ({ access, balanceNote, collectionMethod, ...row }) => row,
        ),
        gpus: months.map((month) => {
            const rows = gpuWorkloadRows(data, month);
            return {
                month,
                summary: rows.length ? gpuWorkloadSummary(rows) : null,
                workloads: rows.map(({ resources, flags, key, ...row }) => row),
            };
        }),
        revenueShare: months.map((month) => ({
            month,
            summary: data.revenueShare?.some(
                (row) => row.month === month && row.row_type === "summary",
            )
                ? revenueShareSummary(data, month)
                : null,
        })),
        reconciliation: months.map((month) => ({
            month,
            openChecks: issues.filter((issue) => issue.month === month).length,
            acceptedExceptions: acceptedExceptions.filter(
                (exception) => exception.month === month,
            ).length,
        })),
    };
}

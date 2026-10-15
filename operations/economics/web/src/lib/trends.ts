import type { Data } from "../types";
import { toUsd } from "./fx";
import { monthShift, reportingMonths } from "./months";
import { ledgerCategory, resolveProvider } from "./providerRegistry";
import { missingUsageCosts } from "./reconciliation";
import { buildRunway } from "./runway";

export type TrendScope = "compute" | "company";
export type TrendMonth = {
    month: string;
    provisional: boolean;
    costIncomplete: boolean;
    issues: string[];
    gross: number | null;
    deductions: number | null;
    revenue: number | null;
    paidCost: number | null;
    credits: number | null;
    fullCost: number | null;
    result: number | null;
    fullResult: number | null;
    computeCost: number | null;
    infrastructureCost: number | null;
    operationsCost: number | null;
};

// Reuse Runway's sales, service-month costs and cash-only exclusions. These
// are sales-based operating results, not consumed-Pollen unit economics.
export function monthlyTrends(data: Data, scope: TrendScope, now = new Date()) {
    const runway = buildRunway(
        data.opTransactions ?? [],
        now,
        data.vendorLedger ?? [],
        data.privateConfig?.forecastRules,
        data.stripeSales ?? [],
    );
    const currentMonth = now.toISOString().slice(0, 7);
    const invalidSales = runway.flags.some(
        (flag) => flag.includes("Stripe sales") && flag.includes("invalid"),
    );
    const warnings = runway.flags.filter(
        (flag) =>
            flag.includes("the P&L shows nothing") ||
            flag.includes("unsupported currency") ||
            flag.includes("invalid kind"),
    );
    const missingCostRows = missingUsageCosts(data).filter(
        (row) =>
            scope === "company" ||
            resolveProvider(row.vendor)?.category !== "infrastructure",
    );
    const months: TrendMonth[] = reportingMonths(now).map((month) => {
        const column = runway.columns.find(
            (c) => c.month === month && c.kind !== "forecast",
        );
        const sales = (data.stripeSales ?? []).filter((r) => r.month === month);
        const issues: string[] = [];
        if (month === currentMonth) issues.push("Month in progress");
        if (!sales.length) issues.push("Stripe sales missing");
        else if (sales.some((r) => r.coverage_complete !== 1))
            issues.push("Stripe reconciliation pending");
        if (invalidSales) issues.push("Invalid Stripe data");
        const hasCosts = (data.vendorLedger ?? []).some(
            (r) =>
                r.start.slice(0, 7) === month &&
                ledgerCategory(r) === "compute" &&
                !(r.credit > 0 && r.paid === 0),
        );
        if (!hasCosts) issues.push("API costs missing");
        const missingProviders = missingCostRows
            .filter((row) => row.month === month)
            .map((row) => row.vendor);
        if (missingProviders.length)
            issues.push(
                `Usage without provider costs: ${missingProviders.join(", ")}`,
            );
        const bankCostGap = warnings.some(
            (w) => w.includes("the P&L shows nothing") && w.includes(month),
        );
        if (bankCostGap)
            issues.push("Paid provider invoice or usage evidence missing");
        const costIncomplete =
            !hasCosts || missingProviders.length > 0 || bankCostGap;
        const revenue =
            column && sales.length && !invalidSales
                ? runway.rows
                      .filter((r) => r.category === "revenue")
                      .reduce((n, r) => n + (r.values[column.id] ?? 0), 0)
                : null;
        const deductions =
            sales.length && !invalidSales
                ? sales.reduce(
                      (n, r) =>
                          n +
                          toUsd(
                              r.refunds + r.reversals + r.stripe_fees,
                              r.currency,
                              month,
                          ),
                      0,
                  )
                : null;
        const costs = runway.rows.filter((r) =>
            scope === "compute"
                ? r.category === "compute"
                : r.category !== "revenue" && r.category !== "balance_sheet",
        );
        const paidCost =
            column && hasCosts
                ? -costs.reduce((n, r) => n + (r.values[column.id] ?? 0), 0)
                : null;
        const credits =
            column && hasCosts
                ? -costs.reduce(
                      (n, r) => n + (r.creditValues?.[column.id] ?? 0),
                      0,
                  )
                : null;
        const fullCost =
            paidCost != null && credits != null ? paidCost + credits : null;
        const categoryCost = (category: string) =>
            column && hasCosts
                ? -costs
                      .filter((r) =>
                          category === "other"
                              ? !["compute", "infrastructure"].includes(
                                    r.category,
                                )
                              : r.category === category,
                      )
                      .reduce(
                          (sum, r) =>
                              sum +
                              (r.values[column.id] ?? 0) +
                              (r.creditValues?.[column.id] ?? 0),
                          0,
                      )
                : null;
        return {
            month,
            issues,
            provisional: issues.length > 0,
            costIncomplete,
            revenue,
            deductions,
            gross:
                revenue != null && deductions != null
                    ? revenue + deductions
                    : null,
            paidCost,
            credits,
            fullCost,
            computeCost: categoryCost("compute"),
            infrastructureCost:
                scope === "company" ? categoryCost("infrastructure") : null,
            operationsCost: scope === "company" ? categoryCost("other") : null,
            result:
                revenue != null && paidCost != null ? revenue - paidCost : null,
            fullResult:
                revenue != null && fullCost != null ? revenue - fullCost : null,
        };
    });
    return { months, warnings };
}

export function trendComparison(months: TrendMonth[], month: string) {
    const current = months.find((r) => r.month === month);
    const previous = months.find((r) => r.month === monthShift(month, -1));
    if (
        !current ||
        !previous ||
        current.provisional ||
        previous.provisional ||
        current.fullResult == null ||
        previous.fullResult == null ||
        current.result == null ||
        previous.result == null ||
        current.gross == null ||
        previous.gross == null ||
        current.deductions == null ||
        previous.deductions == null ||
        current.fullCost == null ||
        previous.fullCost == null ||
        current.credits == null ||
        previous.credits == null
    )
        return null;
    return {
        previous: previous.month,
        gross: current.gross - previous.gross,
        deductions: current.deductions - previous.deductions,
        cost: current.fullCost - previous.fullCost,
        credits: current.credits - previous.credits,
        result: current.result - previous.result,
        fullResult: current.fullResult - previous.fullResult,
    };
}

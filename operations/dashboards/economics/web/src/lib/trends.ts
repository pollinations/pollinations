import type { Data } from "../types";
import { EXPENSE_CATEGORY_ORDER, pnlSource } from "./categories";
import { toUsd } from "./fx";
import { modelReconcileRows } from "./modelReconcile";
import { monthShift, reportingMonths, WINDOW_START } from "./months";
import { ledgerCategory } from "./providerRegistry";
import { missingUsageCosts } from "./reconciliation";
import { buildRunway, sumRecorded } from "./runway";
import { salesFraudAdjustment } from "./salesAdjustments";

export function trendPeriod(count: 3 | 6 | 12, now = new Date()) {
    const end = monthShift(now.toISOString().slice(0, 7), -1);
    const start = monthShift(end, 1 - count);
    return { start: start < WINDOW_START ? WINDOW_START : start, end };
}

export type TrendScope = "product" | "company";

export function trendPercentChange(
    current: number | null | undefined,
    previous: number | null | undefined,
) {
    if (current == null || previous == null || previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

export function isTrendExpense(category: string, scope: TrendScope) {
    return (
        category !== "revenue" &&
        category !== "balance_sheet" &&
        (scope === "company" ||
            ["compute", "infrastructure"].includes(category))
    );
}
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
    oneOffFraud: number | null;
    adjustedResult: number | null;
    adjustedFullResult: number | null;
} & Record<(typeof EXPENSE_CATEGORY_ORDER)[number], number | null>;

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
    const missingCostRows = missingUsageCosts(data);
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
            isTrendExpense(r.category, scope),
        );
        const recordedCost = column
            ? sumRecorded(costs.map((row) => row.values[column.id]))
            : null;
        const paidCost =
            scope === "company" && column
                ? column.totalExpensesUsd == null
                    ? null
                    : -column.totalExpensesUsd
                : recordedCost == null
                  ? null
                  : -recordedCost;
        const credits =
            column && paidCost != null
                ? -costs.reduce(
                      (sum, row) => sum + (row.creditValues?.[column.id] ?? 0),
                      0,
                  )
                : null;
        const fullCost =
            paidCost != null && credits != null ? paidCost + credits : null;
        const categoryCost = (category: string) => {
            if (!column) return null;
            const total = sumRecorded(
                costs
                    .filter((row) => row.category === category)
                    .map((row) => {
                        const value = row.values[column.id];
                        return value == null
                            ? null
                            : value + (row.creditValues?.[column.id] ?? 0);
                    }),
            );
            if (
                total == null &&
                pnlSource(category) === "bank" &&
                (data.opTransactions ?? []).some(
                    (row) =>
                        row.kind === "transaction" &&
                        row.date.slice(0, 7) === month,
                )
            )
                return 0;
            return total == null ? null : -total;
        };
        const adjustments = sales
            .map((sale) => {
                const adjustment = salesFraudAdjustment(sale);
                return adjustment == null
                    ? null
                    : toUsd(adjustment.total, sale.currency, month);
            })
            .filter((amount): amount is number => amount != null);
        const oneOffFraud =
            revenue != null &&
            sales.every((sale) => sale.coverage_complete === 1) &&
            adjustments.length > 0 &&
            adjustments.length ===
                sales.filter((sale) => (sale.fraud_transactions ?? 0) > 0)
                    .length
                ? adjustments.reduce((sum, amount) => sum + amount, 0)
                : null;
        const result =
            revenue != null && paidCost != null ? revenue - paidCost : null;
        const fullResult =
            revenue != null && fullCost != null ? revenue - fullCost : null;
        const expenseCosts = Object.fromEntries(
            EXPENSE_CATEGORY_ORDER.map((category) => [
                category,
                isTrendExpense(category, scope) ? categoryCost(category) : null,
            ]),
        ) as Pick<TrendMonth, (typeof EXPENSE_CATEGORY_ORDER)[number]>;
        return {
            month,
            issues,
            provisional: issues.length > 0 || column?.provisional === true,
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
            ...expenseCosts,
            result,
            fullResult,
            oneOffFraud,
            adjustedResult:
                result != null && oneOffFraud != null
                    ? result + oneOffFraud
                    : null,
            adjustedFullResult:
                fullResult != null && oneOffFraud != null
                    ? fullResult + oneOffFraud
                    : null,
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

export type PollenTrendMonth = {
    month: string;
    paidPollen: number | null;
    questPollen: number | null;
    questCash: number | null;
    questCredits: number | null;
    unallocatedCost: number | null;
};

// Pollen consumption spans the whole platform. Quest funding is only the
// known allocation of recorded Compute costs, never an additional expense.
export function monthlyPollenTrends(
    data: Data,
    months: string[],
): PollenTrendMonth[] {
    const allocations = modelReconcileRows(data);
    const knownSum = sumRecorded;
    return months.map((month) => {
        const usage = (data.opPollen ?? []).filter(
            (row) => row.month === month,
        );
        const models = allocations
            .filter((row) => row.month === month)
            .flatMap((row) => row.models);
        return {
            month,
            paidPollen: usage.length
                ? usage.reduce(
                      (sum, row) =>
                          sum + toUsd(row.price_paid, row.currency, month),
                      0,
                  )
                : null,
            questPollen: usage.length
                ? usage.reduce(
                      (sum, row) =>
                          sum + toUsd(row.price_quests, row.currency, month),
                      0,
                  )
                : null,
            questCash: knownSum(models.map((row) => row.questProviderCashUsd)),
            questCredits: knownSum(
                models.map((row) => row.questProviderCreditUsd),
            ),
            unallocatedCost: knownSum(
                models.map((row) =>
                    row.providerUsageUsd == null
                        ? null
                        : Math.max(
                              0,
                              row.providerUsageUsd -
                                  (row.paidProviderCashUsd ?? 0) -
                                  (row.questProviderCashUsd ?? 0) -
                                  (row.paidProviderCreditUsd ?? 0) -
                                  (row.questProviderCreditUsd ?? 0),
                          ),
                ),
            ),
        };
    });
}

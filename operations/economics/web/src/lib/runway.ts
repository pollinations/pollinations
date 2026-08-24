import type {
    OpForecastMethod,
    OpForecastRow,
    OpTransactionRow,
} from "../types";
import {
    EXPENSE_CATEGORY_ORDER,
    forecastCategory,
    transactionCategory,
} from "./categories";
import { toUsd } from "./fx";
import { monthShift } from "./insights";
import { WINDOW_START } from "./months";

const MONTH_RE = /^\d{4}-\d{2}$/;
const FORECAST_METHODS = new Set<OpForecastMethod>([
    "fixed",
    "funded",
    "last",
    "one_off",
]);
const RUNWAY_CATEGORY_ORDER = [
    "revenue",
    "balance_sheet",
    ...EXPENSE_CATEGORY_ORDER,
];

export type RunwayAssumption = OpForecastRow & {
    amountUsd: number;
};

export type RunwayMatrixRow = {
    category: string;
    vendor: string;
    forecastMethod: OpForecastMethod | null;
    values: Record<string, number>;
    assumptions: Record<string, RunwayAssumption[]>;
};

export type RunwayColumn = {
    id: string;
    month: string;
    kind: "actual" | "current" | "forecast";
    totalExpensesUsd: number;
    netUsd: number;
    runningCashUsd: number | null;
};

export type RunwayResult = {
    currentMonth: string;
    months: string[];
    rows: RunwayMatrixRow[];
    columns: RunwayColumn[];
    assumptions: RunwayAssumption[];
    openingBalanceDate: string | null;
    openingBalanceUsd: number | null;
    latestTransactionDate: string | null;
    currentCashUsd: number | null;
    remainingCurrentPlanUsd: number | null;
    projectedMonthEndCashUsd: number | null;
    runwayMonths: number | null;
    runwayExhaustedMonth: string | null;
    runwayCapped: boolean;
    flags: string[];
};

function monthRange(start: string, end: string): string[] {
    const months: string[] = [];
    let cursor = start;
    while (cursor <= end && months.length < 120) {
        months.push(cursor);
        cursor = monthShift(cursor, 1);
    }
    return months;
}

function normalizedVendor(value: string) {
    return value.trim() || "unmatched";
}

function matrixKey(category: string, vendor: string) {
    return `${category}\u0000${vendor}`;
}

function planMatchKey(vendor: string, amount: number) {
    return `${vendor}\u0000${amount >= 0 ? "inflow" : "outflow"}`;
}

function categoryRank(category: string) {
    const rank = RUNWAY_CATEGORY_ORDER.indexOf(category);
    return rank === -1 ? RUNWAY_CATEGORY_ORDER.length : rank;
}

function addAmount(map: Map<string, number>, key: string, amount: number) {
    map.set(key, (map.get(key) ?? 0) + amount);
}

function balancesInUsd(balances: Map<string, number>, month: string) {
    return [...balances].reduce(
        (sum, [currency, amount]) =>
            sum + (amount === 0 ? 0 : toUsd(amount, currency, month)),
        0,
    );
}

function remainingPlanUsd(
    plan: Map<string, number>,
    actual: Map<string, number> | undefined,
) {
    let remaining = 0;
    for (const [key, target] of plan) {
        const spent = actual?.get(key) ?? 0;
        if (target > 0) remaining += Math.max(0, target - spent);
        if (target < 0) remaining += Math.min(0, target - spent);
    }
    return remaining;
}

export function buildRunway(
    transactions: OpTransactionRow[],
    forecastFacts: OpForecastRow[],
    now: Date = new Date(),
): RunwayResult {
    const currentMonth = now.toISOString().slice(0, 7);
    const flags: string[] = [];
    const actualByMonth = new Map<string, Map<string, number>>();
    const forecastByMonth = new Map<string, Map<string, number>>();
    const actualPlanMatchByMonth = new Map<string, Map<string, number>>();
    const forecastPlanMatchByMonth = new Map<string, Map<string, number>>();
    const assumptionsByCell = new Map<string, RunwayAssumption[]>();
    const identities = new Map<string, { category: string; vendor: string }>();
    const observedMonths = new Set<string>([currentMonth]);

    const invalidKinds = transactions.filter(
        (row) => row.kind !== "transaction" && row.kind !== "opening_balance",
    ).length;
    if (invalidKinds > 0) {
        flags.push(
            `${invalidKinds} bank ${invalidKinds === 1 ? "row has" : "rows have"} an invalid kind; ignored until corrected.`,
        );
    }

    const bankRows = transactions.filter((row) => row.kind === "transaction");
    for (const row of bankRows) {
        const month = row.date.slice(0, 7);
        if (!MONTH_RE.test(month) || month < WINDOW_START) continue;
        const category = transactionCategory(row);
        const vendor = normalizedVendor(row.vendor);
        const amountUsd = toUsd(row.amount, row.currency, row.date);
        const key = matrixKey(category, vendor);
        const monthValues =
            actualByMonth.get(month) ?? new Map<string, number>();
        addAmount(monthValues, key, amountUsd);
        actualByMonth.set(month, monthValues);
        const planMatchValues =
            actualPlanMatchByMonth.get(month) ?? new Map<string, number>();
        addAmount(planMatchValues, planMatchKey(vendor, amountUsd), amountUsd);
        actualPlanMatchByMonth.set(month, planMatchValues);
        identities.set(key, { category, vendor });
        observedMonths.add(month);
    }

    const invalidForecastCategoryVendors = new Set<string>();
    const invalidForecastMethodVendors = new Set<string>();
    const assumptions: RunwayAssumption[] = [];
    for (const fact of forecastFacts) {
        const month = fact.month.slice(0, 7);
        if (!MONTH_RE.test(month) || month < WINDOW_START) continue;
        const category = forecastCategory(fact);
        const vendor = normalizedVendor(fact.vendor);
        const invalidCategory = category === "uncategorized";
        const invalidMethod = !FORECAST_METHODS.has(fact.method);
        if (invalidCategory) {
            invalidForecastCategoryVendors.add(vendor);
        }
        if (invalidMethod) {
            invalidForecastMethodVendors.add(vendor);
        }
        if (invalidCategory || invalidMethod) {
            continue;
        }
        const key = matrixKey(category, vendor);
        const amountUsd = toUsd(fact.amount, fact.currency, fact.month);
        const assumption = { ...fact, category, vendor, amountUsd };
        assumptions.push(assumption);

        const monthValues =
            forecastByMonth.get(month) ?? new Map<string, number>();
        addAmount(monthValues, key, amountUsd);
        forecastByMonth.set(month, monthValues);
        const planMatchValues =
            forecastPlanMatchByMonth.get(month) ?? new Map<string, number>();
        addAmount(planMatchValues, planMatchKey(vendor, amountUsd), amountUsd);
        forecastPlanMatchByMonth.set(month, planMatchValues);
        const cellKey = `${month}\u0000${key}`;
        const cellAssumptions = assumptionsByCell.get(cellKey) ?? [];
        cellAssumptions.push(assumption);
        assumptionsByCell.set(cellKey, cellAssumptions);
        identities.set(key, { category, vendor });
        observedMonths.add(month);
    }

    if (invalidForecastCategoryVendors.size > 0) {
        flags.push(
            `Forecast categories need correction for ${[...invalidForecastCategoryVendors].sort().join(", ")}.`,
        );
    }
    if (invalidForecastMethodVendors.size > 0) {
        flags.push(
            `Forecast methods need correction for ${[...invalidForecastMethodVendors].sort().join(", ")}.`,
        );
    }

    const openingRows = transactions.filter(
        (row) => row.kind === "opening_balance",
    );
    const openingDates = [
        ...new Set(openingRows.map((row) => row.date)),
    ].sort();
    const openingBalanceDate =
        openingDates.length === 1 ? openingDates[0] : null;
    const openingBalances = new Map<string, number>();
    if (openingDates.length === 0) {
        flags.push(
            "No opening bank balance; cash balance and runway are unavailable.",
        );
    } else if (openingDates.length > 1) {
        flags.push(
            `${openingDates.length} opening-balance dates found; keep one statement-backed anchor before calculating cash.`,
        );
    } else if (openingBalanceDate) {
        for (const row of openingRows) {
            addAmount(openingBalances, row.currency, Number(row.amount));
        }
        observedMonths.add(openingBalanceDate.slice(0, 7));
        if (openingBalanceDate.slice(8, 10) !== "01") {
            flags.push(
                `Opening balance ${openingBalanceDate} is not the first day of a month.`,
            );
        }
    }

    const forecastMonths = [...forecastByMonth.keys()]
        .filter((month) => month >= currentMonth)
        .sort();
    const futureForecastMonths = forecastMonths.filter(
        (month) => month > currentMonth,
    );
    const lastFutureForecastMonth = futureForecastMonths.at(-1);
    const missingFutureMonths: string[] = [];
    if (!forecastByMonth.has(currentMonth)) {
        flags.push(
            "No current-month plan; month-end cash and runway are unavailable.",
        );
    }
    if (!lastFutureForecastMonth) {
        flags.push("No future plan; runway is unavailable.");
    } else {
        for (const month of monthRange(
            monthShift(currentMonth, 1),
            lastFutureForecastMonth,
        )) {
            if (!forecastByMonth.has(month)) missingFutureMonths.push(month);
        }
        if (missingFutureMonths.length > 0) {
            flags.push(
                `Forecast gap: ${missingFutureMonths.join(", ")}; runway is unavailable.`,
            );
        }
    }

    const sortedObserved = [...observedMonths]
        .filter((month) => MONTH_RE.test(month) && month >= WINDOW_START)
        .sort();
    const firstObserved = sortedObserved[0];
    const lastObserved = sortedObserved.at(-1);
    const months =
        firstObserved && lastObserved
            ? monthRange(firstObserved, lastObserved)
            : [currentMonth];
    const columnSpecs = months.flatMap<
        Pick<RunwayColumn, "id" | "month" | "kind">
    >((month) => {
        if (month < currentMonth) {
            return [{ id: `${month}:actual`, month, kind: "actual" as const }];
        }
        if (month === currentMonth) {
            return [
                { id: `${month}:current`, month, kind: "current" as const },
                { id: `${month}:forecast`, month, kind: "forecast" as const },
            ];
        }
        return [{ id: `${month}:forecast`, month, kind: "forecast" as const }];
    });

    const rows: RunwayMatrixRow[] = [...identities.entries()]
        .sort(
            ([, a], [, b]) =>
                categoryRank(a.category) - categoryRank(b.category) ||
                a.category.localeCompare(b.category) ||
                a.vendor.localeCompare(b.vendor),
        )
        .map(([key, identity]) => {
            const values: Record<string, number> = {};
            const cellAssumptions: Record<string, RunwayAssumption[]> = {};
            for (const column of columnSpecs) {
                const actual =
                    column.kind === "actual" || column.kind === "current";
                values[column.id] = actual
                    ? (actualByMonth.get(column.month)?.get(key) ?? 0)
                    : (forecastByMonth.get(column.month)?.get(key) ?? 0);
                if (!actual) {
                    const found = assumptionsByCell.get(
                        `${column.month}\u0000${key}`,
                    );
                    if (found?.length) cellAssumptions[column.id] = found;
                }
            }
            const methods = new Set(
                Object.values(cellAssumptions)
                    .flat()
                    .map((assumption) => assumption.method),
            );
            return {
                ...identity,
                forecastMethod: methods.size === 1 ? [...methods][0] : null,
                values,
                assumptions: cellAssumptions,
            };
        });

    const openingBalanceUsd =
        openingBalanceDate == null
            ? null
            : balancesInUsd(openingBalances, openingBalanceDate.slice(0, 7));
    const cashBalanceByMonth = new Map<string, number>();
    if (openingBalanceDate) {
        const nativeBalances = new Map(openingBalances);
        const openingMonth = openingBalanceDate.slice(0, 7);
        for (const month of months) {
            if (month < openingMonth) continue;
            for (const row of bankRows) {
                if (
                    row.date >= openingBalanceDate &&
                    row.date.slice(0, 7) === month
                ) {
                    addAmount(nativeBalances, row.currency, Number(row.amount));
                }
            }
            cashBalanceByMonth.set(month, balancesInUsd(nativeBalances, month));
        }
    }

    const latestTransactionDate = bankRows
        .map((row) => row.date)
        .sort()
        .at(-1);
    const currentCashUsd = cashBalanceByMonth.get(currentMonth) ?? null;
    const currentPlan = forecastPlanMatchByMonth.get(currentMonth);
    const remainingCurrentPlanUsd = currentPlan
        ? remainingPlanUsd(
              currentPlan,
              actualPlanMatchByMonth.get(currentMonth),
          )
        : null;
    const projectedMonthEndCashUsd =
        currentCashUsd != null && remainingCurrentPlanUsd != null
            ? currentCashUsd + remainingCurrentPlanUsd
            : null;

    let projectedCash = projectedMonthEndCashUsd;
    let projectionGap = false;
    const columns: RunwayColumn[] = columnSpecs.map((column) => {
        const totalExpensesUsd = rows
            .filter(
                (row) =>
                    row.category !== "revenue" &&
                    row.category !== "balance_sheet",
            )
            .reduce((sum, row) => sum + (row.values[column.id] ?? 0), 0);
        const netUsd = rows.reduce(
            (sum, row) => sum + (row.values[column.id] ?? 0),
            0,
        );
        let runningCashUsd: number | null = null;
        if (column.kind === "actual" || column.kind === "current") {
            runningCashUsd = cashBalanceByMonth.get(column.month) ?? null;
        } else if (column.month === currentMonth) {
            runningCashUsd = projectedMonthEndCashUsd;
        } else if (
            projectionGap ||
            projectedCash == null ||
            !forecastByMonth.has(column.month)
        ) {
            projectionGap = true;
            projectedCash = null;
        } else {
            projectedCash += netUsd;
            runningCashUsd = projectedCash;
        }
        return {
            ...column,
            totalExpensesUsd,
            netUsd,
            runningCashUsd,
        };
    });

    let runwayMonths: number | null = null;
    let runwayExhaustedMonth: string | null = null;
    let runwayCapped = false;
    if (
        projectedMonthEndCashUsd != null &&
        futureForecastMonths.length > 0 &&
        missingFutureMonths.length === 0
    ) {
        runwayMonths = 0;
        if (projectedMonthEndCashUsd <= 0) {
            runwayExhaustedMonth = currentMonth;
        } else {
            const futureColumns = columns.filter(
                (column) =>
                    column.kind === "forecast" && column.month > currentMonth,
            );
            for (const column of futureColumns) {
                if (
                    column.runningCashUsd == null ||
                    column.runningCashUsd <= 0
                ) {
                    runwayExhaustedMonth = column.month;
                    break;
                }
                runwayMonths += 1;
            }
            runwayCapped =
                runwayExhaustedMonth == null && futureColumns.length > 0;
        }
    }

    return {
        currentMonth,
        months,
        rows,
        columns,
        assumptions,
        openingBalanceDate,
        openingBalanceUsd,
        latestTransactionDate: latestTransactionDate ?? null,
        currentCashUsd,
        remainingCurrentPlanUsd,
        projectedMonthEndCashUsd,
        runwayMonths,
        runwayExhaustedMonth,
        runwayCapped,
        flags,
    };
}

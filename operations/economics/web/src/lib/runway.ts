import type {
    OpForecastMethod,
    OpForecastRow,
    OpTransactionRow,
} from "../types";
import {
    EXPENSE_CATEGORY_ORDER,
    forecastCategory,
    runwayLineItem,
    transactionCategory,
} from "./categories";
import { canConvertToUsd, toUsd } from "./fx";
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
    return String(value ?? "").trim() || "unmatched";
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

    const unsupportedBankRows = transactions.filter(
        (row) =>
            !canConvertToUsd(row.currency) ||
            (String(row.currency ?? "").trim() === "" && row.amount !== 0),
    );
    const bankCurrenciesUsable = unsupportedBankRows.length === 0;
    if (!bankCurrenciesUsable) {
        const currencies = [
            ...new Set(
                unsupportedBankRows.map(
                    (row) => String(row.currency ?? "").trim() || "missing",
                ),
            ),
        ].sort();
        flags.push(
            `${unsupportedBankRows.length} bank ${unsupportedBankRows.length === 1 ? "row uses" : "rows use"} unsupported currency (${currencies.join(", ")}); cash balance and runway are unavailable.`,
        );
    }

    const bankRows = transactions.filter(
        (row) =>
            row.kind === "transaction" && !unsupportedBankRows.includes(row),
    );
    for (const row of bankRows) {
        const month = row.date.slice(0, 7);
        if (!MONTH_RE.test(month) || month < WINDOW_START) continue;
        const category = transactionCategory(row);
        const vendor = normalizedVendor(row.vendor);
        const lineItem = runwayLineItem(category, vendor);
        const amountUsd = toUsd(row.amount, row.currency, row.date);
        const key = matrixKey(category, lineItem);
        const monthValues =
            actualByMonth.get(month) ?? new Map<string, number>();
        addAmount(monthValues, key, amountUsd);
        actualByMonth.set(month, monthValues);
        const planMatchValues =
            actualPlanMatchByMonth.get(month) ?? new Map<string, number>();
        addAmount(planMatchValues, planMatchKey(vendor, amountUsd), amountUsd);
        actualPlanMatchByMonth.set(month, planMatchValues);
        identities.set(key, { category, vendor: lineItem });
        observedMonths.add(month);
    }

    const invalidForecastVendors = new Set<string>();
    const invalidForecastReasons = new Set<string>();
    let invalidForecastFacts = 0;
    const assumptions: RunwayAssumption[] = [];
    for (const fact of forecastFacts) {
        const vendor = normalizedVendor(fact.vendor);
        const factMonth = String(fact.month ?? "");
        const validMonth = /^\d{4}-(0[1-9]|1[0-2])-01$/.test(factMonth);
        const month = validMonth ? factMonth.slice(0, 7) : "";
        if (validMonth && month < WINDOW_START) continue;
        const category = forecastCategory({
            category: String(fact.category ?? ""),
        });
        const lineItem = runwayLineItem(category, vendor);
        const invalidCategory = category === "uncategorized";
        const invalidMethod = !FORECAST_METHODS.has(fact.method);
        const invalidAmount = !Number.isFinite(Number(fact.amount));
        const invalidCurrency = !canConvertToUsd(fact.currency);
        if (
            !validMonth ||
            invalidCategory ||
            invalidMethod ||
            invalidAmount ||
            invalidCurrency
        ) {
            invalidForecastFacts += 1;
            invalidForecastVendors.add(vendor);
            if (!validMonth) invalidForecastReasons.add("month");
            if (invalidCategory) invalidForecastReasons.add("category");
            if (invalidMethod) invalidForecastReasons.add("method");
            if (invalidAmount) invalidForecastReasons.add("amount");
            if (invalidCurrency) invalidForecastReasons.add("currency");
            continue;
        }
        const key = matrixKey(category, lineItem);
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
        identities.set(key, { category, vendor: lineItem });
        observedMonths.add(month);
    }

    const forecastUsable = invalidForecastFacts === 0;
    if (!forecastUsable) {
        flags.push(
            `${invalidForecastFacts} forecast ${invalidForecastFacts === 1 ? "fact needs" : "facts need"} correction (${[...invalidForecastReasons].sort().join(", ")}) for ${[...invalidForecastVendors].sort().join(", ")}; month-end cash and runway are unavailable.`,
        );
    }

    const openingRows = transactions.filter(
        (row) =>
            row.kind === "opening_balance" &&
            !unsupportedBankRows.includes(row),
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
    if (forecastUsable && !forecastByMonth.has(currentMonth)) {
        flags.push(
            "No current-month plan; month-end cash and runway are unavailable.",
        );
    }
    if (forecastUsable && !lastFutureForecastMonth) {
        flags.push("No future plan; runway is unavailable.");
    } else if (forecastUsable && lastFutureForecastMonth) {
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
        openingBalanceDate == null || !bankCurrenciesUsable
            ? null
            : balancesInUsd(openingBalances, openingBalanceDate.slice(0, 7));
    const cashBalanceByMonth = new Map<string, number>();
    let preWindowMovementsUsd = 0;
    if (openingBalanceDate && bankCurrenciesUsable) {
        const nativeBalances = new Map(openingBalances);
        const openingMonth = openingBalanceDate.slice(0, 7);
        if (openingMonth < WINDOW_START) {
            for (const row of bankRows) {
                if (
                    row.date >= openingBalanceDate &&
                    row.date < `${WINDOW_START}-01`
                ) {
                    addAmount(nativeBalances, row.currency, Number(row.amount));
                    preWindowMovementsUsd += toUsd(
                        row.amount,
                        row.currency,
                        `${WINDOW_START}-01`,
                    );
                }
            }
        }
        let nativeBalanceIntegrityLost = false;
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
            const negativeCurrencies = [...nativeBalances]
                .filter(([, amount]) => amount < -0.005)
                .map(([currency]) => currency)
                .sort();
            if (negativeCurrencies.length > 0 && !nativeBalanceIntegrityLost) {
                nativeBalanceIntegrityLost = true;
                flags.push(
                    `Native bank balance becomes negative in ${negativeCurrencies.join(", ")} (${month}); add missing statement movements before calculating cash.`,
                );
            }
            if (!nativeBalanceIntegrityLost) {
                cashBalanceByMonth.set(
                    month,
                    balancesInUsd(nativeBalances, month),
                );
            }
        }
    }

    if (Math.abs(preWindowMovementsUsd) > 0.005) {
        rows.push({
            category: "balance_sheet",
            vendor: "pre-window movements",
            forecastMethod: null,
            values: Object.fromEntries(
                columnSpecs.map((column) => [
                    column.id,
                    column.month === WINDOW_START && column.kind === "actual"
                        ? preWindowMovementsUsd
                        : 0,
                ]),
            ),
            assumptions: {},
        });
    }

    const fxRevaluationValues: Record<string, number> = {};
    if (openingBalanceUsd != null && openingBalanceDate) {
        const openingMonth = openingBalanceDate.slice(0, 7);
        let priorCashUsd: number | null = openingBalanceUsd;
        for (const column of columnSpecs) {
            if (
                column.kind === "forecast" ||
                column.month < openingMonth ||
                priorCashUsd == null
            ) {
                continue;
            }
            const closingCashUsd = cashBalanceByMonth.get(column.month);
            if (closingCashUsd == null) {
                priorCashUsd = null;
                continue;
            }
            const cashMovementsUsd = rows.reduce(
                (total, row) => total + (row.values[column.id] ?? 0),
                0,
            );
            const revaluationUsd =
                closingCashUsd - priorCashUsd - cashMovementsUsd;
            fxRevaluationValues[column.id] = revaluationUsd;
            priorCashUsd = closingCashUsd;
        }
    }
    if (
        Object.values(fxRevaluationValues).some(
            (value) => Math.abs(value) > 0.005,
        )
    ) {
        rows.push({
            category: "balance_sheet",
            vendor: "fx revaluation",
            forecastMethod: null,
            values: Object.fromEntries(
                columnSpecs.map((column) => [
                    column.id,
                    fxRevaluationValues[column.id] ?? 0,
                ]),
            ),
            assumptions: {},
        });
    }
    rows.sort(
        (a, b) =>
            categoryRank(a.category) - categoryRank(b.category) ||
            a.category.localeCompare(b.category) ||
            a.vendor.localeCompare(b.vendor),
    );

    const latestTransactionDate = bankRows
        .map((row) => row.date)
        .sort()
        .at(-1);
    const currentCashUsd = cashBalanceByMonth.get(currentMonth) ?? null;
    const currentPlan = forecastPlanMatchByMonth.get(currentMonth);
    const remainingCurrentPlanUsd =
        forecastUsable && currentPlan
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
        forecastUsable &&
        futureForecastMonths.length > 0 &&
        missingFutureMonths.length === 0
    ) {
        runwayMonths = 0;
        if (projectedMonthEndCashUsd <= 0) {
            runwayExhaustedMonth = currentMonth;
        } else {
            const futureColumns = columns.filter(
                (column) =>
                    column.kind === "forecast" &&
                    column.month > currentMonth &&
                    column.month <= (lastFutureForecastMonth ?? currentMonth),
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

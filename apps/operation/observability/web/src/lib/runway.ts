import type { OpRunwayRow, OpTransactionRow } from "../types";
import { toUsd } from "./fx";
import { WINDOW_START } from "./months";

const MONTH_RE = /^\d{4}-\d{2}$/;
const CATEGORY_ORDER = [
    "revenue",
    "cloud",
    "saas",
    "office",
    "admin",
    "payroll",
];

export type RunwayAssumption = OpRunwayRow & {
    amountUsd: number;
};

export type RunwayForecastMethod = "last" | "zero";

export type RunwayMatrixRow = {
    category: string;
    vendor: string;
    forecastMethod: RunwayForecastMethod | null;
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
    mtdCashUsd: number | null;
    projectedMonthEndCashUsd: number | null;
    runwayMonths: number | null;
    runwayExhaustedMonth: string | null;
    runwayCapped: boolean;
    flags: string[];
};

function monthShift(month: string, delta: number): string {
    const total =
        Number(month.slice(0, 4)) * 12 +
        (Number(month.slice(5, 7)) - 1) +
        delta;
    const year = Math.floor(total / 12);
    const shiftedMonth = (total % 12) + 1;
    return `${String(year).padStart(4, "0")}-${String(shiftedMonth).padStart(2, "0")}`;
}

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

function normalizedCategory(value: string) {
    return value.trim() || "admin";
}

function matrixKey(category: string, vendor: string) {
    return `${category}\u0000${vendor}`;
}

function categoryRank(category: string) {
    const rank = CATEGORY_ORDER.indexOf(category);
    return rank === -1 ? CATEGORY_ORDER.length : rank;
}

export function forecastMethodFromEvidence(
    evidence: string,
): RunwayForecastMethod | null {
    const match = evidence.match(/(?:^|[;\s])method=(last|zero)(?=$|[;\s])/i);
    return (
        (match?.[1]?.toLowerCase() as RunwayForecastMethod | undefined) ?? null
    );
}

function latestOpeningBalance(facts: OpRunwayRow[]) {
    return facts
        .filter((fact) => fact.kind === "opening_balance")
        .sort(
            (a, b) =>
                b.date.localeCompare(a.date) ||
                b.recorded_at.localeCompare(a.recorded_at) ||
                b.entry_id.localeCompare(a.entry_id),
        )[0];
}

export function buildRunway(
    transactions: OpTransactionRow[],
    facts: OpRunwayRow[],
    now: Date = new Date(),
): RunwayResult {
    const currentMonth = now.toISOString().slice(0, 7);
    const flags: string[] = [];
    const actualByMonth = new Map<string, Map<string, number>>();
    const forecastByMonth = new Map<string, Map<string, number>>();
    const assumptionsByCell = new Map<string, RunwayAssumption[]>();
    const identities = new Map<string, { category: string; vendor: string }>();
    const observedMonths = new Set<string>([currentMonth]);

    for (const row of transactions) {
        const month = row.date.slice(0, 7);
        if (!MONTH_RE.test(month) || month < WINDOW_START) continue;
        const category = normalizedCategory(row.category);
        const vendor = normalizedVendor(row.vendor);
        const key = matrixKey(category, vendor);
        const months = actualByMonth.get(month) ?? new Map<string, number>();
        months.set(
            key,
            (months.get(key) ?? 0) + toUsd(row.amount, row.currency, row.date),
        );
        actualByMonth.set(month, months);
        identities.set(key, { category, vendor });
        observedMonths.add(month);
    }

    const assumptions: RunwayAssumption[] = [];
    for (const fact of facts) {
        if (fact.kind !== "forecast") continue;
        const month = fact.date.slice(0, 7);
        if (!MONTH_RE.test(month) || month < WINDOW_START) continue;
        const category = normalizedCategory(fact.category);
        const vendor = normalizedVendor(fact.vendor);
        const key = matrixKey(category, vendor);
        const amountUsd = toUsd(fact.amount, fact.currency, fact.date);
        const assumption = { ...fact, category, vendor, amountUsd };
        assumptions.push(assumption);

        const months = forecastByMonth.get(month) ?? new Map<string, number>();
        months.set(key, (months.get(key) ?? 0) + amountUsd);
        forecastByMonth.set(month, months);
        const cellKey = `${month}\u0000${key}`;
        const cellAssumptions = assumptionsByCell.get(cellKey) ?? [];
        cellAssumptions.push(assumption);
        assumptionsByCell.set(cellKey, cellAssumptions);
        identities.set(key, { category, vendor });
        observedMonths.add(month);
    }

    const openingFacts = facts.filter(
        (fact) => fact.kind === "opening_balance",
    );
    const opening = latestOpeningBalance(facts);
    if (!opening) {
        flags.push(
            "No opening balance fact; running cash and runway are unavailable.",
        );
    } else {
        observedMonths.add(opening.date.slice(0, 7));
        if (openingFacts.length > 1) {
            flags.push(
                `${openingFacts.length} opening balance facts found; using the latest effective date.`,
            );
        }
        if (opening.date.slice(8, 10) !== "01") {
            flags.push(
                `Opening balance date ${opening.date} is not the first day of its month; the full month net is still applied.`,
            );
        }
        if (opening.date.slice(0, 7) < WINDOW_START) {
            flags.push(
                `Opening balance ${opening.date} predates the ${WINDOW_START} Economics window; running cash and runway are unavailable.`,
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
    if (forecastMonths.length === 0) {
        flags.push(
            "No current or future forecast facts; runway is unavailable.",
        );
    } else if (!lastFutureForecastMonth) {
        flags.push("No future forecast facts; runway is unavailable.");
    } else {
        for (const month of monthRange(
            monthShift(currentMonth, 1),
            lastFutureForecastMonth,
        )) {
            if (!forecastByMonth.has(month)) {
                flags.push(
                    `No forecast facts for ${month}; that month is treated as zero.`,
                );
            }
        }
    }
    if (!forecastByMonth.has(currentMonth)) {
        flags.push(
            "No current-month forecast facts; the Forecast column is treated as zero.",
        );
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
    const identityEntries = [...identities.entries()].sort(
        ([, a], [, b]) =>
            categoryRank(a.category) - categoryRank(b.category) ||
            a.category.localeCompare(b.category) ||
            a.vendor.localeCompare(b.vendor),
    );

    const rows: RunwayMatrixRow[] = identityEntries.map(([key, identity]) => {
        const values: Record<string, number> = {};
        const cellAssumptions: Record<string, RunwayAssumption[]> = {};
        for (const column of columnSpecs) {
            const isActual =
                column.kind === "actual" || column.kind === "current";
            values[column.id] = isActual
                ? (actualByMonth.get(column.month)?.get(key) ?? 0)
                : (forecastByMonth.get(column.month)?.get(key) ?? 0);
            if (!isActual) {
                const found = assumptionsByCell.get(
                    `${column.month}\u0000${key}`,
                );
                if (found?.length) cellAssumptions[column.id] = found;
            }
        }
        return {
            ...identity,
            forecastMethod: (() => {
                const methods = new Set(
                    Object.values(cellAssumptions)
                        .flat()
                        .map((assumption) =>
                            forecastMethodFromEvidence(assumption.evidence),
                        )
                        .filter((method) => method != null),
                );
                return methods.size === 1 ? [...methods][0] : null;
            })(),
            values,
            assumptions: cellAssumptions,
        };
    });

    const openingBalanceUsd = opening
        ? toUsd(opening.amount, opening.currency, opening.date)
        : null;
    const openingBalanceDate = opening?.date ?? null;
    const openingMonth = openingBalanceDate?.slice(0, 7) ?? null;
    let plannedRunningCashUsd = openingBalanceUsd;
    let runningStarted = false;
    const columns: RunwayColumn[] = columnSpecs.map((column) => {
        const totalExpensesUsd = rows
            .filter((row) => row.category !== "revenue")
            .reduce((sum, row) => sum + (row.values[column.id] ?? 0), 0);
        const netUsd = rows.reduce(
            (sum, row) => sum + (row.values[column.id] ?? 0),
            0,
        );
        if (openingMonth === column.month) runningStarted = true;

        let runningCashUsd: number | null = null;
        if (runningStarted && plannedRunningCashUsd != null) {
            if (column.kind === "current") {
                runningCashUsd = plannedRunningCashUsd + netUsd;
            } else {
                plannedRunningCashUsd += netUsd;
                runningCashUsd = plannedRunningCashUsd;
            }
        }
        return {
            ...column,
            totalExpensesUsd,
            netUsd,
            runningCashUsd,
        };
    });

    const mtdCashUsd =
        columns.find((column) => column.kind === "current")?.runningCashUsd ??
        null;
    const projectedMonthEndCashUsd =
        columns.find(
            (column) =>
                column.month === currentMonth && column.kind === "forecast",
        )?.runningCashUsd ?? null;
    let runwayMonths: number | null = null;
    let runwayExhaustedMonth: string | null = null;
    let runwayCapped = false;
    if (projectedMonthEndCashUsd != null && futureForecastMonths.length > 0) {
        runwayMonths = 0;
        const runwayWindow = columns.filter(
            (column) => column.kind === "forecast",
        );
        for (const column of runwayWindow) {
            if (column.runningCashUsd == null || column.runningCashUsd <= 0) {
                runwayExhaustedMonth = column.month;
                break;
            }
            runwayMonths += 1;
        }
        runwayCapped = runwayExhaustedMonth == null && runwayWindow.length > 0;
    }

    return {
        currentMonth,
        months,
        rows,
        columns,
        assumptions,
        openingBalanceDate,
        openingBalanceUsd,
        mtdCashUsd,
        projectedMonthEndCashUsd,
        runwayMonths,
        runwayExhaustedMonth,
        runwayCapped,
        flags,
    };
}

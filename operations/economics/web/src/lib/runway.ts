import type { OpCloudRow, OpTransactionRow } from "../types";
import {
    cloudCategory,
    EXPENSE_CATEGORY_ORDER,
    forecastCategory,
    runwayLineItem,
    transactionCategory,
} from "./categories";
import {
    automaticForecastRule,
    type ForecastMethod,
    type ForecastPaymentTiming,
    forecastLineRule,
    forecastPaymentTiming,
    forecastRuleEntries,
} from "./forecastTerms";
import { canConvertToUsd, toUsd } from "./fx";
import {
    isOpCloudBalanceRow,
    monthShift,
    opCloudCreditBurnUsd,
    opCloudPaidBurnUsd,
    providerBalanceRows,
} from "./insights";
import { WINDOW_START } from "./months";

const MONTH_RE = /^\d{4}-\d{2}$/;
const FORECAST_METHODS = new Set<ForecastMethod>([
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

type DerivedForecastFact = {
    entry_id: string;
    month: string;
    vendor: string;
    category: string;
    amount: number;
    currency: string;
    method: ForecastMethod;
    source: "derived";
    evidence: string;
    recorded_at: string;
};

export type RunwayAssumption = DerivedForecastFact & {
    amountUsd: number;
    paymentTiming: ForecastPaymentTiming | null;
};

export type RunwayMatrixRow = {
    category: string;
    vendor: string;
    forecastMethod: ForecastMethod | null;
    forecastPaymentTiming: ForecastPaymentTiming | null;
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

type BalanceAwareForecast = {
    facts: DerivedForecastFact[];
    flags: string[];
};

function daysInUtcMonth(month: string): number {
    const year = Number(month.slice(0, 4));
    const number = Number(month.slice(5, 7));
    return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

function activeInMonth(
    month: string,
    rule: { activeFrom?: string; activeThrough?: string },
): boolean {
    return (
        (!rule.activeFrom || month >= rule.activeFrom) &&
        (!rule.activeThrough || month <= rule.activeThrough)
    );
}

function ruleBasedForecasts(
    transactions: OpTransactionRow[],
    now: Date,
): DerivedForecastFact[] {
    const currentMonth = now.toISOString().slice(0, 7);
    const horizon = `${now.getUTCFullYear() + 1}-12`;
    const recordedAt = now.toISOString().replace("T", " ").replace("Z", "");
    const closedTotals = new Map<string, Map<string, Map<string, number>>>();

    for (const row of transactions) {
        if (row.kind !== "transaction") continue;
        const month = row.date.slice(0, 7);
        if (!MONTH_RE.test(month) || month >= currentMonth) continue;
        const category = transactionCategory(row);
        const vendor = normalizedVendor(row.vendor);
        const key = matrixKey(category, vendor);
        const monthTotals =
            closedTotals.get(key) ?? new Map<string, Map<string, number>>();
        const currencyTotals =
            monthTotals.get(month) ?? new Map<string, number>();
        currencyTotals.set(
            row.currency,
            (currencyTotals.get(row.currency) ?? 0) + Number(row.amount),
        );
        monthTotals.set(month, currencyTotals);
        closedTotals.set(key, monthTotals);
    }

    const facts: DerivedForecastFact[] = [];
    const addFact = (
        vendor: string,
        category: string,
        month: string,
        amount: number,
        currency: string,
        method: ForecastMethod,
        evidence: string,
    ) => {
        if (
            month < currentMonth ||
            month > horizon ||
            Math.abs(amount) <= 0.005
        )
            return;
        facts.push({
            entry_id: `derived-${month}-${vendor}-${category}-${currency}-${facts.length}`,
            month: `${month}-01`,
            vendor,
            category,
            amount,
            currency,
            method,
            source: "derived",
            evidence,
            recorded_at: recordedAt,
        });
    };

    for (const { vendor, category, rule } of forecastRuleEntries()) {
        for (const scheduled of rule.scheduledAmounts ?? []) {
            addFact(
                vendor,
                category,
                scheduled.month,
                scheduled.amount,
                scheduled.currency,
                "one_off",
                `Scheduled once: ${scheduled.note}`,
            );
        }
        if (
            rule.automaticUsage ||
            (rule.method !== "fixed" && rule.method !== "last")
        ) {
            continue;
        }

        const amounts = rule.fixedAmounts?.map((amount) => ({
            ...amount,
            sourceMonth: null as string | null,
        }));
        const inferredAmounts = amounts ?? [];
        if (!amounts) {
            const monthTotals = closedTotals.get(matrixKey(category, vendor));
            const sourceMonth = [...(monthTotals?.keys() ?? [])].sort().at(-1);
            if (sourceMonth) {
                const currencyTotals = monthTotals?.get(sourceMonth);
                for (const [currency, amount] of currencyTotals ?? []) {
                    inferredAmounts.push({
                        amount,
                        currency: currency as "EUR" | "USD",
                        sourceMonth,
                    });
                }
            }
        }
        if (inferredAmounts.length === 0) continue;

        for (
            let month = currentMonth;
            month <= horizon;
            month = monthShift(month, 1)
        ) {
            if (!activeInMonth(month, rule)) continue;
            for (const amount of inferredAmounts) {
                addFact(
                    vendor,
                    category,
                    month,
                    amount.amount,
                    amount.currency,
                    rule.method,
                    amount.sourceMonth
                        ? `Calculated from verified ${amount.sourceMonth} bank total`
                        : "Reviewed fixed amount",
                );
            }
        }
    }

    return facts;
}

function balanceAwareForecasts(
    transactions: OpTransactionRow[],
    cloudRows: OpCloudRow[],
    now: Date,
): BalanceAwareForecast {
    const currentMonth = now.toISOString().slice(0, 7);
    const horizon = `${now.getUTCFullYear() + 1}-12`;
    if (cloudRows.length === 0) return { facts: [], flags: [] };

    const balances = new Map(
        providerBalanceRows(
            { opCloud: cloudRows, opTransactions: transactions },
            now,
        )
            .filter((row) => row.balanceStatus === "checked")
            .map((row) => [row.vendor, row] as const),
    );
    const burnByKeyMonth = new Map<string, Map<string, number>>();
    const currentPaidBurnByKey = new Map<string, number>();
    const coverageDayByKey = new Map<string, number>();
    const today = now.toISOString().slice(0, 10);
    for (const row of cloudRows) {
        if (isOpCloudBalanceRow(row)) continue;
        const category = cloudCategory(row);
        const rule = automaticForecastRule(row.vendor, category);
        if (!rule) continue;
        const month = row.start.slice(0, 7);
        if (!MONTH_RE.test(month)) continue;
        const paidBurn = opCloudPaidBurnUsd(row);
        const burn = paidBurn + opCloudCreditBurnUsd(row);
        if (Math.abs(burn) <= 0.005) continue;
        const key = matrixKey(category, row.vendor);
        const months = burnByKeyMonth.get(key) ?? new Map<string, number>();
        months.set(month, (months.get(month) ?? 0) + burn);
        burnByKeyMonth.set(key, months);
        if (month === currentMonth) {
            currentPaidBurnByKey.set(
                key,
                (currentPaidBurnByKey.get(key) ?? 0) + paidBurn,
            );
            const endDate = row.end.slice(0, 10);
            const recordedDate = row.recorded_at.slice(0, 10);
            const coverageDate =
                recordedDate.startsWith(currentMonth) && recordedDate <= today
                    ? recordedDate
                    : endDate.startsWith(currentMonth) && endDate <= today
                      ? endDate
                      : null;
            if (coverageDate) {
                coverageDayByKey.set(
                    key,
                    Math.max(
                        coverageDayByKey.get(key) ?? 0,
                        Number(coverageDate.slice(8, 10)),
                    ),
                );
            }
        }
    }

    const daysThisMonth = daysInUtcMonth(currentMonth);
    const lastMonth = monthShift(currentMonth, -1);
    const ratesByVendor = new Map<
        string,
        {
            category: string;
            currentBurn: number;
            currentPaidBurn: number;
            monthlyRate: number;
            paymentTiming: ForecastPaymentTiming;
            usageThrough: string | null;
        }[]
    >();
    for (const [key, months] of burnByKeyMonth) {
        const separator = key.indexOf("\u0000");
        const category = key.slice(0, separator);
        const vendor = key.slice(separator + 1);
        const rule = automaticForecastRule(vendor, category);
        if (!rule) continue;
        const currentBurn = Math.max(0, months.get(currentMonth) ?? 0);
        const lastBurn = Math.max(0, months.get(lastMonth) ?? 0);
        const coverageDay = coverageDayByKey.get(key) ?? null;
        const monthlyRate =
            currentBurn > 0 && coverageDay != null
                ? (currentBurn / coverageDay) * daysThisMonth
                : lastBurn;
        if (monthlyRate <= 0.005) continue;
        const rates = ratesByVendor.get(vendor) ?? [];
        rates.push({
            category,
            currentBurn,
            currentPaidBurn: Math.max(0, currentPaidBurnByKey.get(key) ?? 0),
            monthlyRate,
            paymentTiming: rule.paymentTiming,
            usageThrough:
                coverageDay == null
                    ? null
                    : `${currentMonth}-${String(coverageDay).padStart(2, "0")}`,
        });
        ratesByVendor.set(vendor, rates);
    }

    const facts: DerivedForecastFact[] = [];
    const missingBalanceVendors = new Set<string>();
    const currentActualByKey = new Map<string, number>();
    for (const row of transactions) {
        if (
            row.kind !== "transaction" ||
            row.date.slice(0, 7) !== currentMonth
        ) {
            continue;
        }
        const category = transactionCategory(row);
        const key = matrixKey(category, normalizedVendor(row.vendor));
        const amount = toUsd(row.amount, row.currency, row.date);
        currentActualByKey.set(
            key,
            (currentActualByKey.get(key) ?? 0) + amount,
        );
    }
    const recordedAt = now.toISOString().replace("T", " ").replace("Z", "");
    const addCash = (
        vendor: string,
        category: string,
        month: string,
        amount: number,
        evidence: string,
    ) => {
        if (month > horizon) return;
        facts.push({
            entry_id: `derived-${month}-${vendor}-${category}-${facts.length}`,
            month: `${month}-01`,
            vendor,
            category,
            amount: amount <= 0.005 ? 0 : -amount,
            currency: "USD",
            method: "last",
            source: "derived",
            evidence,
            recorded_at: recordedAt,
        });
    };

    for (const [vendor, rates] of ratesByVendor) {
        const balance = balances.get(vendor);
        const directRates = rates.filter(
            (rate) => rate.paymentTiming === "direct",
        );
        const balanceRates = rates.filter(
            (rate) => rate.paymentTiming !== "direct",
        );
        for (const rate of directRates) {
            addCash(
                vendor,
                rate.category,
                currentMonth,
                rate.monthlyRate,
                `Projected current-month run rate ${Math.round(rate.monthlyRate)}; direct${rate.usageThrough ? `; usage through ${rate.usageThrough}` : ""}`,
            );
            for (
                let month = monthShift(currentMonth, 1);
                month <= horizon;
                month = monthShift(month, 1)
            ) {
                addCash(
                    vendor,
                    rate.category,
                    month,
                    rate.monthlyRate,
                    `Run rate ${Math.round(rate.monthlyRate)}; direct${rate.usageThrough ? `; usage through ${rate.usageThrough}` : ""}`,
                );
            }
        }
        if (!balance || balanceRates.length === 0) {
            if (!balance && balanceRates.length > 0) {
                missingBalanceVendors.add(vendor);
            }
            continue;
        }

        for (const rate of balanceRates) {
            const currentActual = Math.max(
                0,
                -(
                    currentActualByKey.get(matrixKey(rate.category, vendor)) ??
                    0
                ),
            );
            if (currentActual > 0.005) {
                addCash(
                    vendor,
                    rate.category,
                    currentMonth,
                    currentActual,
                    "Verified current-month bank cash",
                );
            }
        }

        let credit = Math.max(0, balance.creditBalanceUsd ?? 0);
        let prepaid = Math.max(0, balance.cashBalanceUsd ?? 0);
        const expiryMonth =
            balance.creditDepletionReason === "expiry" &&
            balance.creditDepletionDate
                ? balance.creditDepletionDate.slice(0, 7)
                : null;

        const scheduleUsage = (
            usageMonth: string,
            usageByCategory: {
                category: string;
                amount: number;
                accruedCash: number;
                usageThrough: string | null;
            }[],
        ) => {
            if (expiryMonth && usageMonth > expiryMonth) credit = 0;
            const totalUsage = usageByCategory.reduce(
                (sum, item) => sum + item.amount,
                0,
            );
            if (totalUsage <= 0.005) {
                for (const item of usageByCategory) {
                    if (item.accruedCash <= 0.005) continue;
                    const timing = forecastPaymentTiming(vendor, item.category);
                    if (timing !== "postpaid") continue;
                    addCash(
                        vendor,
                        item.category,
                        monthShift(usageMonth, 1),
                        item.accruedCash,
                        `Accrued postpaid usage; checked balance as of ${balance.balanceAsOf ?? "unknown"}`,
                    );
                }
                return;
            }
            const fromCredit = Math.min(credit, totalUsage);
            credit -= fromCredit;
            const afterCredit = totalUsage - fromCredit;
            const fromPrepaid = Math.min(prepaid, afterCredit);
            prepaid -= fromPrepaid;
            const cashRequired = afterCredit - fromPrepaid;
            for (const item of usageByCategory) {
                const timing = forecastPaymentTiming(vendor, item.category);
                if (timing !== "prepaid" && timing !== "postpaid") continue;
                // The reviewed current-month prepaid fact already represents
                // cash paid to date. Use the remaining current-month usage to
                // reduce the live balance, but never add a second cash row.
                if (timing === "prepaid" && usageMonth === currentMonth) {
                    continue;
                }
                const paymentMonth =
                    timing === "postpaid"
                        ? monthShift(usageMonth, 1)
                        : usageMonth;
                const amount =
                    cashRequired <= 0.005
                        ? 0
                        : cashRequired * (item.amount / totalUsage);
                addCash(
                    vendor,
                    item.category,
                    paymentMonth,
                    amount + item.accruedCash,
                    `Run rate ${Math.round(item.amount)}; ${timing}; checked balance ${Math.round((balance.cashBalanceUsd ?? 0) + (balance.creditBalanceUsd ?? 0))} as of ${balance.balanceAsOf ?? "unknown"}${item.usageThrough ? `; usage through ${item.usageThrough}` : ""}`,
                );
            }
        };

        scheduleUsage(
            currentMonth,
            balanceRates.map((rate) => ({
                category: rate.category,
                amount: Math.max(0, rate.monthlyRate - rate.currentBurn),
                accruedCash:
                    rate.paymentTiming === "postpaid"
                        ? rate.currentPaidBurn
                        : 0,
                usageThrough: rate.usageThrough,
            })),
        );
        for (
            let month = monthShift(currentMonth, 1);
            month <= horizon;
            month = monthShift(month, 1)
        ) {
            scheduleUsage(
                month,
                balanceRates.map((rate) => ({
                    category: rate.category,
                    amount: rate.monthlyRate,
                    accruedCash: 0,
                    usageThrough: rate.usageThrough,
                })),
            );
        }
    }

    return {
        facts,
        flags:
            missingBalanceVendors.size === 0
                ? []
                : [
                      `Checked balance missing for ${[...missingBalanceVendors].sort().join(", ")}; prepaid or postpaid run-rate cash is not forecast.`,
                  ],
    };
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
    now: Date = new Date(),
    cloudRows: OpCloudRow[] = [],
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

    const ruleBased = ruleBasedForecasts(transactions, now);
    const balanceAware = balanceAwareForecasts(transactions, cloudRows, now);
    flags.push(...balanceAware.flags);
    const effectiveForecastFacts = [...ruleBased, ...balanceAware.facts];

    const invalidForecastVendors = new Set<string>();
    const invalidForecastReasons = new Set<string>();
    let invalidForecastFacts = 0;
    const assumptions: RunwayAssumption[] = [];
    for (const fact of effectiveForecastFacts) {
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
        const assumption = {
            ...fact,
            category,
            vendor,
            amountUsd,
            paymentTiming: forecastPaymentTiming(vendor, category),
        };
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
            const futureAssumptions = Object.values(cellAssumptions)
                .flat()
                .filter(
                    (assumption) =>
                        assumption.month.slice(0, 7) >= currentMonth,
                );
            const methods = new Set(
                futureAssumptions.map((assumption) => assumption.method),
            );
            const paymentTimings = new Set(
                futureAssumptions
                    .map((assumption) => assumption.paymentTiming)
                    .filter(
                        (timing): timing is ForecastPaymentTiming =>
                            timing != null,
                    ),
            );
            const reviewedRule = forecastLineRule(
                identity.vendor,
                identity.category,
            );
            return {
                ...identity,
                forecastMethod:
                    methods.size === 1
                        ? [...methods][0]
                        : methods.size === 0
                          ? (reviewedRule?.method ?? null)
                          : null,
                forecastPaymentTiming:
                    paymentTimings.size === 1
                        ? [...paymentTimings][0]
                        : paymentTimings.size === 0
                          ? (reviewedRule?.paymentTiming ?? null)
                          : null,
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
        const rule = forecastLineRule("pre-window movements", "balance_sheet");
        rows.push({
            category: "balance_sheet",
            vendor: "pre-window movements",
            forecastMethod: rule?.method ?? null,
            forecastPaymentTiming: rule?.paymentTiming ?? null,
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
        const rule = forecastLineRule("fx revaluation", "balance_sheet");
        rows.push({
            category: "balance_sheet",
            vendor: "fx revaluation",
            forecastMethod: rule?.method ?? null,
            forecastPaymentTiming: rule?.paymentTiming ?? null,
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
    const unmodeledRows = rows.filter((row) => row.forecastMethod == null);
    if (unmodeledRows.length > 0) {
        flags.push(
            `Calculation mode missing for ${unmodeledRows.map((row) => `${row.vendor} (${row.category})`).join(", ")}.`,
        );
    }

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

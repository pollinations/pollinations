import type {
    OpCloudRow,
    OpTransactionRow,
    PrivateForecastRule,
    StripeSalesRow,
} from "../types";
import {
    cloudCategory,
    EXPENSE_CATEGORY_ORDER,
    forecastCategory,
    runwayLineItem,
    transactionCategory,
} from "./categories";
import {
    isOpCloudBalanceRow,
    opCloudCreditBurnUsd,
    opCloudPaidBurnUsd,
} from "./computeLedger";
import {
    automaticForecastRule,
    type ForecastMethod,
    type ForecastPaymentTiming,
    forecastLineRule,
    forecastPaymentTiming,
    forecastRuleEntries,
} from "./forecastTerms";
import { canConvertToUsd, toUsd } from "./fx";
import { monthShift, WINDOW_START } from "./months";
import {
    consumeBalanceLots,
    providerAccountBalanceRows,
} from "./providerBalances";
import {
    canonicalProviderAccountId,
    resolveProvider,
    resolveProviderAccount,
} from "./providerRegistry";

const MONTH_RE = /^\d{4}-\d{2}$/;
const FORECAST_METHODS = new Set<ForecastMethod>([
    "fixed",
    "funded",
    "last",
    "one_off",
]);
const STRIPE_LINES = [
    "pollen sales",
    "ko-fi",
    "stripe refunds",
    "stripe reversals",
    "stripe fees",
];

function stripeActivityLines(row: StripeSalesRow): [string, string, number][] {
    return [
        [
            row.revenue_stream === "pollen" ? "pollen sales" : "ko-fi",
            "revenue",
            row.gross_sales,
        ],
        ["stripe refunds", "revenue", -row.refunds],
        ["stripe reversals", "revenue", -row.reversals],
        ["stripe fees", "operations", -row.stripe_fees],
    ];
}
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
    forecastIssue?: string;
    category: string;
    vendor: string;
    // "mixed" describes grouped rows, not a calculation method for a fact.
    forecastMethod: ForecastMethod | "mixed" | null;
    forecastPaymentTiming: ForecastPaymentTiming | null;
    values: Record<string, number>;
    assumptions: Record<string, RunwayAssumption[]>;
};

export type RunwayColumn = {
    forecastComplete?: boolean;
    id: string;
    month: string;
    kind: "actual" | "current" | "forecast";
    totalExpensesUsd: number;
    operatingResultUsd: number;
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
    privateRules?: Readonly<Record<string, PrivateForecastRule>>,
    stripeSales: readonly StripeSalesRow[] = [],
): BalanceAwareForecast {
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
        if (category === "revenue" && vendor === "stripe") continue;
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

    for (const row of stripeSales) {
        if (!MONTH_RE.test(row.month) || row.month >= currentMonth) continue;
        for (const [vendor, category, amount] of stripeActivityLines(row)) {
            const key = matrixKey(category, vendor);
            const months =
                closedTotals.get(key) ?? new Map<string, Map<string, number>>();
            const currencies =
                months.get(row.month) ?? new Map<string, number>();
            addAmount(currencies, row.currency, amount);
            months.set(row.month, currencies);
            closedTotals.set(key, months);
        }
    }

    const facts: DerivedForecastFact[] = [];
    const flags: string[] = [];
    const settledEntries = new Set<string>();
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

    for (const { vendor, category, rule } of forecastRuleEntries(
        privateRules,
    )) {
        for (const scheduled of rule.scheduledAmounts ?? []) {
            const ids = scheduled.settledByEntryIds ?? [];
            if (ids.length > 0) {
                const matching = transactions.filter((row) =>
                    ids.includes(row.entry_id),
                );
                const valid =
                    new Set(ids).size === ids.length &&
                    !ids.some((id) => settledEntries.has(id)) &&
                    matching.length === ids.length &&
                    matching.every(
                        (row) =>
                            row.kind === "transaction" &&
                            row.vendor === vendor &&
                            transactionCategory(row) === category &&
                            row.currency === scheduled.currency &&
                            row.date <= now.toISOString().slice(0, 10) &&
                            Math.sign(row.amount) ===
                                Math.sign(scheduled.amount),
                    ) &&
                    Math.abs(
                        matching.reduce((sum, row) => sum + row.amount, 0) -
                            scheduled.amount,
                    ) < 0.01;
                if (valid) {
                    for (const id of ids) settledEntries.add(id);
                    continue;
                }
                flags.push(
                    `Scheduled ${vendor} movement (${scheduled.month}) has invalid settlement links; verify the Bank entries.`,
                );
            }
            if (scheduled.month < currentMonth) {
                flags.push(
                    `Scheduled ${vendor} ${scheduled.currency} ${scheduled.amount} (${scheduled.month}) is overdue or unmatched; confirm receipt/payment and link the Bank entry, or reschedule. It is not assumed settled.`,
                );
                continue;
            }
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
                        ? `Calculated from verified ${amount.sourceMonth} ${STRIPE_LINES.includes(vendor) ? "Stripe activity" : "bank total"}`
                        : "Reviewed fixed amount",
                );
            }
        }
    }

    return { facts, flags };
}

function balanceAwareForecasts(
    transactions: OpTransactionRow[],
    cloudRows: OpCloudRow[],
    now: Date,
): BalanceAwareForecast & { issues: Map<string, string> } {
    const groups = new Map<string, OpCloudRow[]>();
    const facts: DerivedForecastFact[] = [];
    const flags: string[] = [];
    const issues = new Map<string, string>();
    const currentMonth = now.toISOString().slice(0, 7);
    const previousMonth = monthShift(currentMonth, -1);
    for (const row of cloudRows) {
        const provider = resolveProvider(row.vendor);
        const account = canonicalProviderAccountId(provider, row.account_id);
        const key = `${row.vendor}\u0000${account}`;
        const group = groups.get(key) ?? [];
        group.push(row);
        groups.set(key, group);
    }
    for (const rows of groups.values()) {
        const row = rows[0];
        const provider = resolveProvider(row.vendor);
        const relevant = rows.some(
            (r) =>
                !isOpCloudBalanceRow(r) &&
                [previousMonth, currentMonth].includes(r.start.slice(0, 7)) &&
                automaticForecastRule(r.vendor, cloudCategory(r)),
        );
        if (!relevant) continue;
        if (
            provider?.accounts?.length &&
            !resolveProviderAccount(provider, row.account_id)
        ) {
            flags.push(
                `Usage account missing or unrecognized for ${row.vendor}; its forecast is unavailable.`,
            );
            issues.set(row.vendor, "Usage account missing or unrecognized");
            continue;
        }
        const result = accountBalanceForecasts(rows, now);
        const account = canonicalProviderAccountId(provider, row.account_id);
        facts.push(
            ...result.facts.map((fact) => ({
                ...fact,
                entry_id: `${fact.entry_id}-${account}`,
                evidence: `${fact.evidence}; account ${account}`,
            })),
        );
        flags.push(...result.flags);
        if (result.flags.length) issues.set(row.vendor, result.flags.join(" "));
    }
    // Cash paid to date is included once per vendor, not once per account.
    for (const row of transactions) {
        if (
            row.kind !== "transaction" ||
            row.date.slice(0, 7) !== now.toISOString().slice(0, 7)
        )
            continue;
        const category = transactionCategory(row);
        const rule = automaticForecastRule(row.vendor, category);
        if (!rule || rule.paymentTiming === "direct") continue;
        facts.push({
            entry_id: `derived-bank-${row.entry_id}`,
            month: `${row.date.slice(0, 7)}-01`,
            vendor: row.vendor,
            category,
            amount: toUsd(row.amount, row.currency, row.date),
            currency: "USD",
            method: "last",
            source: "derived",
            evidence: "Verified current-month bank cash",
            recorded_at: now.toISOString(),
        });
    }
    return { facts, flags: [...new Set(flags)], issues };
}

function accountBalanceForecasts(
    cloudRows: OpCloudRow[],
    now: Date,
): BalanceAwareForecast {
    const currentMonth = now.toISOString().slice(0, 7);
    const horizon = `${now.getUTCFullYear() + 1}-12`;
    if (cloudRows.length === 0) return { facts: [], flags: [] };
    const unresolved: string[] = [];

    const balances = new Map(
        providerAccountBalanceRows({ opCloud: cloudRows }, now)
            .filter((row) => row.active && row.balanceStatus === "checked")
            .map((row) => [row.vendor, row] as const),
    );
    const burnByKeyMonth = new Map<string, Map<string, number>>();
    const currentPaidBurnByKey = new Map<string, number>();
    const previousPaidBurnByKey = new Map<string, number>();
    const coverageDayByKey = new Map<string, number>();
    const today = now.toISOString().slice(0, 10);

    const usageCoverageDate = (row: OpCloudRow): string | null => {
        const endDate = row.end.slice(0, 10);
        let coverageDate: string | null = null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            const endIsExclusive = row.end.slice(11, 19) === "00:00:00";
            coverageDate = endIsExclusive
                ? new Date(
                      Date.parse(`${endDate}T00:00:00Z`) - 24 * 60 * 60 * 1_000,
                  )
                      .toISOString()
                      .slice(0, 10)
                : endDate;
        }
        if (coverageDate?.startsWith(currentMonth) && coverageDate <= today) {
            return coverageDate;
        }

        return null;
    };

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
        if (month === monthShift(currentMonth, -1)) {
            previousPaidBurnByKey.set(
                key,
                (previousPaidBurnByKey.get(key) ?? 0) + paidBurn,
            );
        }
        if (month === currentMonth) {
            currentPaidBurnByKey.set(
                key,
                (currentPaidBurnByKey.get(key) ?? 0) + paidBurn,
            );
            const coverageDate = usageCoverageDate(row);
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
        if (currentBurn > 0 && coverageDay == null) {
            unresolved.push(
                `Usage coverage date missing for ${vendor} (${category}); its forecast is unavailable.`,
            );
            continue;
        }
        if (
            rule.paymentTiming === "postpaid" &&
            (previousPaidBurnByKey.get(key) ?? 0) > 0.005
        ) {
            unresolved.push(
                `Opening ${lastMonth} postpaid settlement not reconciled for ${vendor} (${category}); confirm the invoice and matched payments before trusting current-month cash.`,
            );
        }
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
        if (
            !balance.creditTermsKnown &&
            !balance.expiryAssumed &&
            (balance.creditBalanceUsd ?? 0) > 0
        ) {
            unresolved.push(
                `Credit expiry not verified for ${vendor} / ${balance.accountLabel}; its cash forecast is unavailable.`,
            );
            continue;
        }

        const fundingLots = balance.fundingLots.map((lot) => ({ ...lot }));

        const scheduleUsage = (
            usageMonth: string,
            usageByCategory: {
                category: string;
                amount: number;
                accruedCash: number;
                usageThrough: string | null;
            }[],
        ) => {
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
            // Spread the monthly run rate over service days, not past expiry.
            const firstDay =
                usageMonth === currentMonth
                    ? Math.max(
                          1,
                          ...usageByCategory.map((item) =>
                              item.usageThrough
                                  ? Number(item.usageThrough.slice(8, 10)) + 1
                                  : 1,
                          ),
                      )
                    : 1;
            const lastDay = daysInUtcMonth(usageMonth);
            const dailyUsage = totalUsage / Math.max(1, lastDay - firstDay + 1);
            let cashRequired = 0;
            for (let day = firstDay; day <= lastDay; day += 1) {
                cashRequired += consumeBalanceLots(
                    fundingLots,
                    dailyUsage,
                    `${usageMonth}-${String(day).padStart(2, "0")}`,
                );
            }
            for (const item of usageByCategory) {
                const timing = forecastPaymentTiming(vendor, item.category);
                if (timing !== "prepaid" && timing !== "postpaid") continue;
                // The reviewed current-month prepaid fact represents only cash
                // paid to date. The live balance funds the remaining usage;
                // forecast only the share that the balance cannot cover.
                if (timing === "prepaid" && usageMonth === currentMonth) {
                    if (cashRequired > 0.005) {
                        addCash(
                            vendor,
                            item.category,
                            usageMonth,
                            cashRequired * (item.amount / totalUsage),
                            `Remaining current-month prepaid shortfall; checked balance as of ${balance.balanceAsOf ?? "unknown"}`,
                        );
                    }
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
                    `Run rate ${Math.round(item.amount)}; ${timing}; checked balance ${Math.round((balance.cashBalanceUsd ?? 0) + (balance.creditBalanceUsd ?? 0))} as of ${balance.balanceAsOf ?? "unknown"}${item.usageThrough ? `; usage through ${item.usageThrough}` : ""}${balance.expiryAssumed ? "; user-approved ignore-expiry assumption for this balance snapshot" : ""}`,
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
        flags: [
            ...unresolved,
            ...(missingBalanceVendors.size === 0
                ? []
                : [
                      `Checked balance missing for ${[...missingBalanceVendors].sort().join(", ")}; prepaid or postpaid run-rate cash is not forecast.`,
                  ]),
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
    privateRules?: Readonly<Record<string, PrivateForecastRule>>,
    stripeSales: readonly StripeSalesRow[] = [],
): RunwayResult {
    const currentMonth = now.toISOString().slice(0, 7);
    const flags: string[] = [];
    const actualByMonth = new Map<string, Map<string, number>>();
    const cashActualByMonth = new Map<string, Map<string, number>>();
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
    const relevantStripeSales = stripeSales.filter(
        (row) => row.month >= WINDOW_START,
    );
    const invalidStripeSales = relevantStripeSales.filter(
        (row) =>
            !MONTH_RE.test(row.month) ||
            !canConvertToUsd(row.currency) ||
            !Number.isFinite(row.gross_sales) ||
            !Number.isFinite(row.refunds) ||
            !["pollen", "kofi"].includes(row.revenue_stream) ||
            !Number.isFinite(row.reversals) ||
            !Number.isFinite(row.net_sales) ||
            !Number.isFinite(row.stripe_fees) ||
            !Number.isFinite(row.net_after_fees) ||
            !Number.isFinite(row.payments) ||
            !Number.isFinite(row.refund_count) ||
            row.gross_sales < 0 ||
            row.refunds < 0 ||
            row.reversals < 0 ||
            row.stripe_fees < 0 ||
            row.payments < 0 ||
            row.refund_count < 0 ||
            Math.abs(
                row.gross_sales - row.refunds - row.reversals - row.net_sales,
            ) > 0.01 ||
            Math.abs(row.net_sales - row.stripe_fees - row.net_after_fees) >
                0.01,
    );
    const bankStripeRevenueRows = bankRows.filter(
        (row) =>
            normalizedVendor(row.vendor) === "stripe" &&
            transactionCategory(row) === "revenue",
    );
    const latestClosedMonth = monthShift(currentMonth, -1);
    const latestStripeSales = relevantStripeSales.filter(
        (row) => row.month === latestClosedMonth,
    );
    const stripeSalesAreCurrent =
        latestStripeSales.length > 0 &&
        latestStripeSales.every((row) => row.coverage_complete === 1);
    const stripeSalesUsable = invalidStripeSales.length === 0;
    const stripeForecastUsable =
        stripeSalesUsable &&
        ((bankStripeRevenueRows.length === 0 &&
            relevantStripeSales.length === 0) ||
            stripeSalesAreCurrent);
    if (invalidStripeSales.length > 0) {
        flags.push(
            `${invalidStripeSales.length} Stripe sales ${invalidStripeSales.length === 1 ? "row is" : "rows are"} invalid; Stripe P&L revenue and its forecast are unavailable.`,
        );
    } else if (
        bankStripeRevenueRows.length > 0 &&
        relevantStripeSales.length === 0
    ) {
        flags.push(
            "Stripe sales are missing; Stripe P&L revenue and its forecast are unavailable. Wise payouts remain included in cash.",
        );
    } else if (!stripeForecastUsable) {
        flags.push(
            `Stripe collection is not verified complete for ${latestClosedMonth}; its forecast is unavailable. Recorded sales and Wise cash remain visible.`,
        );
    }

    for (const row of bankRows) {
        const month = row.date.slice(0, 7);
        if (!MONTH_RE.test(month) || month < WINDOW_START) continue;
        const category = transactionCategory(row);
        const vendor = normalizedVendor(row.vendor);
        const lineItem = runwayLineItem(category, vendor);
        const amountUsd = toUsd(row.amount, row.currency, row.date);
        const key = matrixKey(category, lineItem);
        const cashMonthValues =
            cashActualByMonth.get(month) ?? new Map<string, number>();
        addAmount(cashMonthValues, key, amountUsd);
        cashActualByMonth.set(month, cashMonthValues);
        if (!(category === "revenue" && vendor === "stripe")) {
            const monthValues =
                actualByMonth.get(month) ?? new Map<string, number>();
            addAmount(monthValues, key, amountUsd);
            actualByMonth.set(month, monthValues);
            identities.set(key, { category, vendor: lineItem });
        }
        const planMatchValues =
            actualPlanMatchByMonth.get(month) ?? new Map<string, number>();
        addAmount(planMatchValues, planMatchKey(vendor, amountUsd), amountUsd);
        actualPlanMatchByMonth.set(month, planMatchValues);
        observedMonths.add(month);
    }

    if (stripeSalesUsable) {
        for (const row of relevantStripeSales) {
            const monthValues =
                actualByMonth.get(row.month) ?? new Map<string, number>();
            for (const [vendor, category, amount] of stripeActivityLines(row)) {
                const key = matrixKey(category, vendor);
                addAmount(
                    monthValues,
                    key,
                    toUsd(amount, row.currency, row.month),
                );
                identities.set(key, { vendor, category });
            }
            actualByMonth.set(row.month, monthValues);
            observedMonths.add(row.month);
        }
    }

    const ruleBased = ruleBasedForecasts(
        transactions,
        now,
        privateRules,
        stripeForecastUsable ? latestStripeSales : [],
    );
    const balanceAware = balanceAwareForecasts(bankRows, cloudRows, now);
    flags.push(...ruleBased.flags, ...balanceAware.flags);
    const effectiveForecastFacts = [...ruleBased.facts, ...balanceAware.facts];

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
        const cashMatchVendor =
            category === "revenue" && ["pollen sales", "ko-fi"].includes(vendor)
                ? "stripe"
                : vendor;
        addAmount(
            planMatchValues,
            planMatchKey(cashMatchVendor, amountUsd),
            amountUsd,
        );
        forecastPlanMatchByMonth.set(month, planMatchValues);
        const cellKey = `${month}\u0000${key}`;
        const cellAssumptions = assumptionsByCell.get(cellKey) ?? [];
        cellAssumptions.push(assumption);
        assumptionsByCell.set(cellKey, cellAssumptions);
        identities.set(key, { category, vendor: lineItem });
        observedMonths.add(month);
    }

    const forecastUsable =
        invalidForecastFacts === 0 &&
        stripeForecastUsable &&
        balanceAware.flags.length === 0;
    if (invalidForecastFacts > 0) {
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

    // Keep a usage-only vendor visible when a missing balance/coverage check
    // prevented it from producing forecast facts or bank movements.
    for (const row of cloudRows) {
        if (isOpCloudBalanceRow(row) || !balanceAware.issues.has(row.vendor))
            continue;
        const category = cloudCategory(row);
        if (automaticForecastRule(row.vendor, category)) {
            identities.set(matrixKey(category, row.vendor), {
                vendor: row.vendor,
                category,
            });
        }
    }
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
                          : "mixed",
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
            const cashMovementsUsd = [
                ...(cashActualByMonth.get(column.month)?.values() ?? []),
            ].reduce((total, amount) => total + amount, 0);
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
    // Sales and fees are activity facts; Wise payouts are transfers of the
    // processor balance. Keep their difference visible, never as revenue.
    const settlementValues = Object.fromEntries(
        columnSpecs.map((column) => {
            if (column.kind === "forecast") return [column.id, 0];
            const payouts = bankStripeRevenueRows
                .filter((row) => row.date.slice(0, 7) === column.month)
                .reduce(
                    (sum, row) =>
                        sum + toUsd(row.amount, row.currency, row.date),
                    0,
                );
            const activity = actualByMonth.get(column.month);
            const netSales =
                (activity?.get(matrixKey("revenue", "pollen sales")) ?? 0) +
                (activity?.get(matrixKey("revenue", "ko-fi")) ?? 0) +
                (activity?.get(matrixKey("revenue", "stripe refunds")) ?? 0) +
                (activity?.get(matrixKey("revenue", "stripe reversals")) ?? 0) +
                (activity?.get(matrixKey("operations", "stripe fees")) ?? 0);
            return [column.id, payouts - netSales];
        }),
    );
    if (
        Object.values(settlementValues).some((value) => Math.abs(value) > 0.005)
    ) {
        rows.push({
            category: "balance_sheet",
            vendor: "processor settlement timing",
            forecastMethod: "one_off",
            forecastPaymentTiming: null,
            values: settlementValues,
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
    for (const row of rows) {
        row.forecastIssue =
            balanceAware.issues.get(row.vendor) ??
            (!stripeForecastUsable && STRIPE_LINES.includes(row.vendor)
                ? "Stripe month coverage is incomplete"
                : row.forecastMethod == null
                  ? "Calculation mode missing"
                  : undefined);
    }
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
        const netUsd =
            column.kind === "forecast"
                ? rows.reduce(
                      (sum, row) => sum + (row.values[column.id] ?? 0),
                      0,
                  )
                : [
                      ...(cashActualByMonth.get(column.month)?.values() ?? []),
                  ].reduce((sum, amount) => sum + amount, 0) +
                  (fxRevaluationValues[column.id] ?? 0);
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
            forecastComplete:
                column.kind !== "forecast" ||
                (forecastUsable && unmodeledRows.length === 0),
            totalExpensesUsd,
            operatingResultUsd: rows
                .filter((row) => row.category !== "balance_sheet")
                .reduce((sum, row) => sum + (row.values[column.id] ?? 0), 0),
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

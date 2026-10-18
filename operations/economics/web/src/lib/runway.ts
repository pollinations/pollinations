import type {
    OpTransactionRow,
    PrivateForecastRule,
    StripeSalesRow,
    VendorLedgerRow,
} from "../types";
import {
    cloudCategory,
    EXPENSE_CATEGORY_ORDER,
    forecastCategory,
    pnlSource,
} from "./categories";

export { pnlSource } from "./categories";

import {
    automaticForecastRule,
    type ForecastMethod,
    type ForecastPaymentTiming,
    forecastLineRule,
    forecastPaymentTiming,
    forecastRuleEntries,
    RUNWAY_REVIEW,
    type RunwayReview,
} from "./forecastTerms";
import { fmtExactNumber as fmtNumber } from "./format";
import { canConvertToUsd, toUsd } from "./fx";
import { monthShift, WINDOW_START } from "./months";
import {
    consumeBalanceLots,
    providerAccountBalanceRows,
} from "./providerBalances";
import {
    bankPaymentHasServiceEvidence,
    coversCalendarMonth,
} from "./providerClose";
import {
    canonicalProviderAccountId,
    cashOnlyTransaction,
    cloudObservationMonths,
    ledgerCategory,
    resolveProvider,
    resolveProviderAccount,
    runwayLineItem,
    transactionCategory,
} from "./providerRegistry";
import { salesForecastRows } from "./sales";
import {
    isVendorLedgerBalanceRow,
    vendorLedgerCreditBurnUsd,
    vendorLedgerPaidBurnUsd,
} from "./vendorLedger";

const MONTH_RE = /^\d{4}-\d{2}$/;
const FORECAST_METHODS = new Set<ForecastMethod>([
    "fixed",
    "funded",
    "last",
    "one_off",
]);
const STRIPE_LINES = ["stripe sales", "stripe refunds"];

// Revenue is what entered Stripe in the month, net of Stripe's own fees, for
// every stream (Pollen and Ko-fi). Refunds and reversals are one line.
function stripeActivityLines(row: StripeSalesRow): [string, string, number][] {
    return [
        [
            "stripe sales",
            "revenue",
            row.gross_sales - row.stripe_fees + row.dispute_fees,
        ],
        [
            "stripe refunds",
            "revenue",
            -(row.refunds + row.reversals + row.dispute_fees),
        ],
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
    credit?: number;
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
    actualIssues?: Record<string, string>;
    // Components of the parent value; never add to totals again.
    details?: { label: string; values: Record<string, number> }[];
    category: string;
    vendor: string;
    // "mixed" describes grouped rows, not a calculation method for a fact.
    forecastMethod: ForecastMethod | "mixed" | null;
    forecastPaymentTiming: ForecastPaymentTiming | null;
    values: Record<string, number | null>;
    // Usage paid from provider credits, kept beside `values` and never counted
    // as cash: it is not part of `values` or of any column total.
    creditValues?: Record<string, number>;
    assumptions: Record<string, RunwayAssumption[]>;
};

// A recorded subtotal is absent only when none of its components were recorded.
export function sumRecorded(
    values: (number | null | undefined)[],
): number | null {
    const known = values.filter((value): value is number => value != null);
    return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

export type RunwayColumn = {
    provisional?: boolean;
    forecastComplete?: boolean;
    id: string;
    month: string;
    kind: "actual" | "current" | "forecast";
    totalExpensesUsd: number | null;
    // Credit-funded usage of the expense lines, shown beside the cash total.
    totalCreditUsd: number | null;
    operatingResultUsd: number | null;
    netUsd: number | null;
    runningCashUsd: number | null;
    cashBridge?: {
        revenue: number;
        expenses: number;
        receiptsDifference: number;
        paymentsDifference: number;
        otherCash: number;
        exchangeRates: number;
    };
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
    forecastTimingNote: string | null;
    currentCashUsd: number | null;
    review: RunwayReview;
    fundingProvisional: boolean;
    projectedMonthEndCashUsd: number | null;
    runwayMonths: number | null;
    runwayExhaustedMonth: string | null;
    runwayCapped: boolean;
    flags: string[];
    billingNotices: string[];
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
    fundingGaps?: string[];
    notices?: string[];
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
    review: RunwayReview = RUNWAY_REVIEW,
): BalanceAwareForecast {
    const currentMonth = monthShift(review.baselineMonth, 1);
    const horizon = `${now.getUTCFullYear() + 1}-12`;
    const recordedAt = now.toISOString().replace("T", " ").replace("Z", "");
    const closedTotals = new Map<string, Map<string, Map<string, number>>>();

    for (const row of transactions) {
        if (row.kind !== "transaction") continue;
        const month = row.date.slice(0, 7);
        if (month !== review.baselineMonth) continue;
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
        if (month < currentMonth || month > horizon) return;
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
                if (valid && scheduled.month < currentMonth) {
                    for (const id of ids) settledEntries.add(id);
                    continue;
                }
                if (!valid)
                    flags.push(
                        `Scheduled ${vendor} movement (${scheduled.month}) has invalid settlement links; verify the Bank entries.`,
                    );
            }
            if (scheduled.month < currentMonth) {
                flags.push(
                    `Scheduled ${vendor} ${scheduled.currency} ${fmtNumber(scheduled.amount)} (${scheduled.month}) is overdue or unmatched; confirm receipt/payment and link the Bank entry, or reschedule. It is not assumed settled.`,
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
            const projected =
                vendor === "stripe sales" && !amounts
                    ? salesForecastRows(
                          stripeSales,
                          month,
                          new Date(`${review.asOf}T23:59:59Z`),
                          privateRules?.["stripe sales|revenue"]
                              ?.salesStoppedFrom,
                      )
                    : null;
            for (const amount of inferredAmounts) {
                const projectedAmount = projected
                    ? projected
                          .filter((row) => row.currency === amount.currency)
                          .reduce(
                              (sum, row) =>
                                  sum +
                                  row.gross_sales -
                                  row.stripe_fees +
                                  row.dispute_fees,
                              0,
                          )
                    : amount.amount;
                addFact(
                    vendor,
                    category,
                    month,
                    projectedAmount,
                    amount.currency,
                    rule.method,
                    amount.sourceMonth
                        ? `Calculated from verified ${amount.sourceMonth} ${STRIPE_LINES.includes(vendor) ? "Stripe activity" : "bank total"}${projected && privateRules?.["stripe sales|revenue"]?.salesStoppedFrom ? "; closed sales streams are not projected" : ""}`
                        : "Reviewed fixed amount",
                );
            }
        }
    }

    return { facts, flags };
}

function balanceAwareForecasts(
    cloudRows: VendorLedgerRow[],
    now: Date,
    review: RunwayReview,
    privateRules?: Readonly<Record<string, PrivateForecastRule>>,
): BalanceAwareForecast & {
    issues: Map<string, string>;
    fundingGaps: string[];
} {
    const groups = new Map<string, VendorLedgerRow[]>();
    const facts: DerivedForecastFact[] = [];
    const flags: string[] = [];
    const issues = new Map<string, string>();
    const fundingGaps: string[] = [];
    const notices: string[] = [];
    const currentMonth = monthShift(review.baselineMonth, 1);
    const previousMonth = review.baselineMonth;
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
                (r.start.slice(0, 7) >= previousMonth ||
                    isVendorLedgerBalanceRow(r)) &&
                automaticForecastRule(
                    r.vendor,
                    isVendorLedgerBalanceRow(r)
                        ? (provider?.category ?? "uncategorized")
                        : cloudCategory(r),
                    privateRules,
                ),
        );
        if (!relevant) continue;
        const definition =
            provider && resolveProviderAccount(provider, row.account_id);
        if (definition?.activeTo && definition.activeTo < currentMonth)
            continue;
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
        const result = accountBalanceForecasts(rows, now, review, privateRules);
        const account = canonicalProviderAccountId(provider, row.account_id);
        facts.push(
            ...result.facts.map((fact) => ({
                ...fact,
                entry_id: `${fact.entry_id}-${account}`,
                evidence: `${fact.evidence}; account ${account}`,
            })),
        );
        flags.push(...result.flags);
        fundingGaps.push(...(result.fundingGaps ?? []));
        notices.push(...(result.notices ?? []));
        if (result.flags.length) issues.set(row.vendor, result.flags.join(" "));
    }
    return { facts, flags: [...new Set(flags)], fundingGaps, notices, issues };
}

function accountBalanceForecasts(
    cloudRows: VendorLedgerRow[],
    now: Date,
    review: RunwayReview,
    privateRules?: Readonly<Record<string, PrivateForecastRule>>,
): BalanceAwareForecast {
    const currentMonth = monthShift(review.baselineMonth, 1);
    const baselineMonth = review.baselineMonth;
    const horizon = `${now.getUTCFullYear() + 1}-12`;
    const vendor = cloudRows[0].vendor;
    const usage = cloudRows.filter(
        (row) => !isVendorLedgerBalanceRow(row) && row.type !== "grant",
    );
    const baseline = usage.filter(
        (row) => row.start.slice(0, 7) === baselineMonth,
    );
    if (!coversCalendarMonth(baseline, baselineMonth)) {
        return {
            facts: [],
            flags: [
                `${vendor}: complete ${baselineMonth} usage is missing; no monthly forecast baseline is assumed.`,
            ],
        };
    }
    const rates = new Map<
        string,
        {
            total: number;
            paid: number;
            timing: ForecastPaymentTiming;
            activeFrom?: string;
            activeThrough?: string;
        }
    >();
    for (const row of baseline) {
        const category = cloudCategory(row);
        const rule = automaticForecastRule(vendor, category, privateRules);
        if (!rule) continue;
        const rate = rates.get(category) ?? {
            total: 0,
            paid: 0,
            timing: rule.paymentTiming,
            activeFrom: rule.activeFrom,
            activeThrough: rule.activeThrough,
        };
        rate.paid += vendorLedgerPaidBurnUsd(row);
        rate.total +=
            vendorLedgerPaidBurnUsd(row) + vendorLedgerCreditBurnUsd(row);
        rates.set(category, rate);
    }
    const facts: DerivedForecastFact[] = [];
    const fundingGaps: string[] = [];
    const notices: string[] = [];
    const add = (
        category: string,
        month: string,
        cash: number,
        credit: number,
        evidence: string,
    ) => {
        if (month > horizon) return;
        facts.push({
            entry_id: `derived-${month}-${vendor}-${category}-${facts.length}`,
            month: `${month}-01`,
            vendor,
            category,
            amount: -Math.max(0, cash),
            credit: -Math.max(0, credit),
            currency: "USD",
            method: "last",
            source: "derived",
            evidence,
            recorded_at: now.toISOString(),
        });
    };
    // Only opening-day funding supports depletion calculations. Without it,
    // budget the baseline cash/credit split without consuming a later snapshot.
    const openingDate = `${currentMonth}-01`;
    const balance = providerAccountBalanceRows(
        { vendorLedger: cloudRows },
        new Date(`${openingDate}T23:59:59Z`),
    ).find((row) => row.active && row.balanceStatus === "checked");
    const latestBalanceDate = cloudRows
        .filter(isVendorLedgerBalanceRow)
        .map((row) => row.start.slice(0, 10))
        .sort()
        .at(-1);
    const fundedRates = [...rates].filter(
        ([, rate]) => rate.timing !== "direct" && rate.total > 0,
    );
    if (fundedRates.length && !balance) {
        fundingGaps.push(
            latestBalanceDate
                ? `${vendor}: opening balance for ${openingDate} is missing (balance checked ${latestBalanceDate}); funding depletion is unverified; the plan provisionally repeats the baseline cash/credit split.`
                : `${vendor}: checked account balance missing; funding depletion is unverified; the plan provisionally repeats the baseline cash/credit split.`,
        );
    } else if (
        fundedRates.length &&
        balance &&
        !balance.creditTermsKnown &&
        !balance.expiryAssumed &&
        (balance.creditBalanceUsd ?? 0) > 0
    ) {
        fundingGaps.push(
            `${vendor}: credit expiry not verified; funding depletion is unverified; the plan provisionally repeats the baseline cash/credit split.`,
        );
    }
    const anchor = balance?.balanceAsOf ?? openingDate;
    const lots = balance?.fundingLots.map((lot) => ({ ...lot })) ?? [];
    for (const [category, rate] of rates) {
        if (
            rate.timing === "postpaid" &&
            rate.paid > 0 &&
            activeInMonth(baselineMonth, rate)
        ) {
            add(
                category,
                currentMonth,
                rate.paid,
                0,
                `Estimated ${baselineMonth} postpaid bill from recorded cash-funded usage; independent of current bank payments.`,
            );
            notices.push(
                `${vendor} (${category}): ${currentMonth} includes the estimated settlement for ${baselineMonth} cash-funded usage.`,
            );
        }
    }
    for (
        let month = currentMonth;
        month <= horizon;
        month = monthShift(month, 1)
    ) {
        const days = daysInUtcMonth(month);
        const totalRate = fundedRates
            .filter(([, rate]) => activeInMonth(month, rate))
            .reduce((sum, [, rate]) => sum + rate.total, 0);
        let newCash = 0;
        let credits = 0;
        if (fundingGaps.length === 0 && totalRate > 0) {
            for (let day = 1; day <= days; day++) {
                const beforeCredits = lots.reduce(
                    (sum, lot) => sum + lot.creditUsd,
                    0,
                );
                newCash += consumeBalanceLots(
                    lots,
                    totalRate / days,
                    `${month}-${String(day).padStart(2, "0")}`,
                );
                credits +=
                    beforeCredits -
                    lots.reduce((sum, lot) => sum + lot.creditUsd, 0);
            }
        }
        for (const [category, rate] of rates) {
            if (!activeInMonth(month, rate)) continue;
            const funding =
                rate.timing === "direct"
                    ? "direct monthly budget"
                    : fundingGaps.length
                      ? "provisional baseline cash/credit split; funding depletion unverified"
                      : `full-month budget using opening balance checked ${anchor}${balance?.expiryAssumed ? "; approved snapshot expiry assumption" : ""}`;
            const evidence = `${baselineMonth} complete-month usage baseline ${fmtNumber(rate.total)}; ${rate.timing}; ${funding}`;
            if (rate.timing === "direct" || rate.total === 0) {
                add(category, month, rate.total, 0, evidence);
                continue;
            }
            const share = rate.total / totalRate;
            const cash = fundingGaps.length ? rate.paid : newCash * share;
            const credit = fundingGaps.length
                ? rate.total - rate.paid
                : credits * share;
            // Credits are consumption in the service month; postpaid cash settles
            // the following month. Existing prepaid cash is consumed by lots,
            // never added to the bank-payment forecast a second time.
            add(
                category,
                month,
                rate.timing === "prepaid" ? cash : 0,
                credit,
                evidence,
            );
            if (rate.timing === "postpaid")
                add(category, monthShift(month, 1), cash, 0, evidence);
        }
    }
    return { facts, flags: [], fundingGaps, notices };
}

function balancesInUsd(balances: Map<string, number>, month: string) {
    return [...balances].reduce(
        (sum, [currency, amount]) =>
            sum + (amount === 0 ? 0 : toUsd(amount, currency, month)),
        0,
    );
}

export function buildRunway(
    transactions: OpTransactionRow[],
    now: Date = new Date(),
    cloudRows: VendorLedgerRow[] = [],
    privateRules?: Readonly<Record<string, PrivateForecastRule>>,
    stripeSales: readonly StripeSalesRow[] = [],
    review: RunwayReview = RUNWAY_REVIEW,
): RunwayResult {
    const currentMonth = now.toISOString().slice(0, 7);
    const priorMonth = monthShift(currentMonth, -1);
    const reviewIsCurrent = review.baselineMonth === priorMonth;
    const flags: string[] = [];
    if (!reviewIsCurrent)
        flags.push(
            `Plan baseline ${review.baselineMonth} needs review for ${currentMonth}; close ${priorMonth} before relying on projected cash or runway. Monthly rules have not been changed automatically.`,
        );
    const actualByMonth = new Map<string, Map<string, number>>();
    const cashActualByMonth = new Map<string, Map<string, number>>();
    const forecastByMonth = new Map<string, Map<string, number>>();
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
    // Refund failures, recovered disputes and returned fees can be net credits.
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
            !Number.isFinite(row.dispute_fees) ||
            !Number.isFinite(row.net_after_fees) ||
            !Number.isFinite(row.payments) ||
            !Number.isFinite(row.refund_count) ||
            row.gross_sales < 0 ||
            row.payments < 0 ||
            row.refund_count < 0 ||
            Math.abs(
                row.gross_sales - row.refunds - row.reversals - row.net_sales,
            ) > 0.01 ||
            Math.abs(row.net_sales - row.stripe_fees - row.net_after_fees) >
                0.01,
    );
    // Wise payouts only signal that Stripe activity exists; they never enter
    // revenue and are not reconciled against the month's sales.
    const bankStripeRevenueRows = bankRows.filter(
        (row) =>
            normalizedVendor(row.vendor) === "stripe" &&
            transactionCategory(row) === "revenue",
    );
    const latestClosedMonth = review.baselineMonth;
    const latestStripeSales = relevantStripeSales.filter(
        (row) => row.month === latestClosedMonth,
    );
    const stripeSalesAreCurrent =
        latestStripeSales.length > 0 &&
        latestStripeSales.every((row) => row.coverage_complete === 1);
    const stripeSalesUsable = invalidStripeSales.length === 0;
    const stripeForecastUsable =
        !invalidStripeSales.some((row) => row.month === latestClosedMonth) &&
        ((bankStripeRevenueRows.length === 0 &&
            relevantStripeSales.length === 0) ||
            stripeSalesAreCurrent);
    if (invalidStripeSales.length > 0) {
        flags.push(
            `${invalidStripeSales.length} Stripe sales ${invalidStripeSales.length === 1 ? "row is" : "rows are"} invalid; recorded Stripe P&L revenue is unavailable. The plan validates its selected baseline separately.`,
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

    // Ledger categories: bank payments settle invoices that the vendor ledger
    // already expensed, so they stay in cash and out of the P&L lines.
    const ledgerVendorPayments = new Map<
        string,
        { category: string; usd: number; months: Set<string> }
    >();
    const creditFundedByMonth = new Map<string, Map<string, number>>();
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
        if (pnlSource(category) === "ledger") {
            const payments = ledgerVendorPayments.get(vendor) ?? {
                category,
                usd: 0,
                months: new Set<string>(),
            };
            payments.usd += amountUsd;
            payments.months.add(month);
            ledgerVendorPayments.set(vendor, payments);
        } else if (
            !(category === "revenue" && vendor === "stripe") &&
            !cashOnlyTransaction(row)
        ) {
            // Cash-only movements (registry `cashOnly` on the vendor or on
            // its cash rule) change cash without a table line, like Stripe
            // payouts.
            // An explicit reviewed allocation moves only the expense, never
            // the bank movement or its USD valuation. Do not infer it from an invoice date.
            const expenseMonth =
                category !== "revenue" && category !== "balance_sheet"
                    ? (row.evidence.match(
                          /(?:^|;\s*)expense_month=(\d{4}-(?:0[1-9]|1[0-2]))(?=;|$)/,
                      )?.[1] ?? month)
                    : month;
            const monthValues =
                actualByMonth.get(expenseMonth) ?? new Map<string, number>();
            addAmount(monthValues, key, amountUsd);
            actualByMonth.set(expenseMonth, monthValues);
            if (expenseMonth !== month) {
                const paymentMonthValues =
                    actualByMonth.get(month) ?? new Map<string, number>();
                if (!paymentMonthValues.has(key))
                    paymentMonthValues.set(key, 0);
                actualByMonth.set(month, paymentMonthValues);
                observedMonths.add(expenseMonth);
            }
            identities.set(key, { category, vendor: lineItem });
        }
        observedMonths.add(month);
    }

    // Ledger categories take their actuals from the vendor ledger by service
    // month: paid usage is the expense; credit-funded usage is kept beside it
    // in `creditValues` and never reaches cash.

    for (const row of cloudRows) {
        if (isVendorLedgerBalanceRow(row) || (row.credit > 0 && row.paid === 0))
            continue;
        const category = ledgerCategory(row);
        if (pnlSource(category) !== "ledger" || category === "uncategorized") {
            continue;
        }
        const month = row.start.slice(0, 7);
        if (!MONTH_RE.test(month) || month < WINDOW_START) continue;
        if (month > currentMonth) continue;
        const vendor = normalizedVendor(row.vendor);
        const paidUsd = vendorLedgerPaidBurnUsd(row);
        const creditUsd = vendorLedgerCreditBurnUsd(row);
        // Zero-only bookkeeping does not introduce an unmodeled forecast line.
        if (
            paidUsd === 0 &&
            creditUsd === 0 &&
            !forecastLineRule(vendor, category)
        )
            continue;

        const key = matrixKey(category, vendor);
        const monthValues =
            actualByMonth.get(month) ?? new Map<string, number>();
        addAmount(monthValues, key, 0 - paidUsd);
        actualByMonth.set(month, monthValues);
        const creditValues =
            creditFundedByMonth.get(month) ?? new Map<string, number>();
        addAmount(creditValues, key, 0 - creditUsd);
        creditFundedByMonth.set(month, creditValues);
        identities.set(key, { category, vendor });
        observedMonths.add(month);
        for (const zeroMonth of cloudObservationMonths(row)) {
            if (zeroMonth === month || zeroMonth > currentMonth) continue;
            const zeroValues =
                actualByMonth.get(zeroMonth) ?? new Map<string, number>();
            if (!zeroValues.has(key)) zeroValues.set(key, 0);
            actualByMonth.set(zeroMonth, zeroValues);
        }
    }
    // A bank payment still held as cash prepaid on the vendor's latest balance
    // snapshot has nothing to expense yet: the money moved into a prepaid
    // balance, not into usage; the payment stays a plain cash movement.
    const latestPrepaidByVendor = new Map<
        string,
        { start: string; usd: number }
    >();
    for (const row of cloudRows) {
        if (!isVendorLedgerBalanceRow(row)) continue;
        const vendor = normalizedVendor(row.vendor);
        const current = latestPrepaidByVendor.get(vendor);
        if (current && current.start >= row.start) continue;
        latestPrepaidByVendor.set(vendor, {
            start: row.start,
            usd: toUsd(row.paid, row.currency, row.start),
        });
    }
    // Cash proves a payment, not its service month. Keep unmatched periods open
    // unless the same-month usage or a retained supplier-invoice match exists.
    const actualIssuesByCell = new Map<string, string>();
    for (const [vendor, payments] of ledgerVendorPayments) {
        const prepaid = latestPrepaidByVendor.get(vendor);
        if (prepaid && prepaid.usd >= -payments.usd - 0.5) continue;
        const unmatched = bankRows.filter(
            (row) =>
                row.vendor === vendor &&
                pnlSource(transactionCategory(row)) === "ledger" &&
                row.amount < 0 &&
                row.date.slice(0, 7) >= WINDOW_START &&
                !bankPaymentHasServiceEvidence(row, cloudRows),
        );
        if (!unmatched.length) continue;
        const months = [
            ...new Set(unmatched.map((row) => row.date.slice(0, 7))),
        ].sort();
        const message =
            "Service-month costs unavailable; the bank payment has no matched vendor invoice or usage record";
        identities.set(matrixKey(payments.category, vendor), {
            category: payments.category,
            vendor,
        });
        for (const month of months)
            actualIssuesByCell.set(
                `${month}\u0000${matrixKey(payments.category, vendor)}`,
                message,
            );
        flags.push(
            `Bank paid ${vendor} (${payments.category}) in ${months.join(", ")}, but the vendor ledger has no same-month usage or explicit supplier-invoice match; the P&L shows nothing for those payments until their service period is reconciled.`,
        );
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
        review,
    );
    const planCloudRows = cloudRows.filter(
        (row) =>
            row.start.slice(0, 10) <= review.asOf &&
            row.recorded_at.slice(0, 10) <= review.asOf,
    );
    const balanceAware = balanceAwareForecasts(
        planCloudRows,
        now,
        review,
        privateRules,
    );
    flags.push(
        ...ruleBased.flags,
        ...balanceAware.flags,
        ...balanceAware.fundingGaps,
    );
    const forecastCreditsByMonth = new Map<string, Map<string, number>>();
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
        if (fact.credit != null) {
            const creditValues =
                forecastCreditsByMonth.get(month) ?? new Map<string, number>();
            addAmount(creditValues, key, fact.credit);
            forecastCreditsByMonth.set(month, creditValues);
        }
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
        const cellKey = `${month}\u0000${key}`;
        const cellAssumptions = assumptionsByCell.get(cellKey) ?? [];
        cellAssumptions.push(assumption);
        assumptionsByCell.set(cellKey, cellAssumptions);
        identities.set(key, { category, vendor: lineItem });
        observedMonths.add(month);
    }

    const fundedCashLines = new Set(
        cloudRows
            .filter(
                (row) =>
                    !isVendorLedgerBalanceRow(row) &&
                    row.start.slice(0, 7) === review.baselineMonth &&
                    forecastLineRule(
                        row.vendor,
                        ledgerCategory(row),
                        privateRules,
                    )?.method === "funded" &&
                    vendorLedgerPaidBurnUsd(row) > 0.005,
            )
            .map((row) =>
                matrixKey(ledgerCategory(row), normalizedVendor(row.vendor)),
            ),
    );
    const forecastUsable =
        reviewIsCurrent &&
        invalidForecastFacts === 0 &&
        stripeForecastUsable &&
        balanceAware.flags.length === 0 &&
        fundedCashLines.size === 0;
    if (invalidForecastFacts > 0) {
        flags.push(
            `${invalidForecastFacts} forecast ${invalidForecastFacts === 1 ? "fact needs" : "facts need"} correction (${[...invalidForecastReasons].sort().join(", ")}) for ${[...invalidForecastVendors].sort().join(", ")}; month-end cash and runway are unavailable.`,
        );
    }

    const statementOpeningRows = transactions.filter(
        (row) =>
            row.kind === "opening_balance" &&
            !unsupportedBankRows.includes(row),
    );
    const firstOpeningDate = statementOpeningRows
        .map((row) => row.date)
        .sort()[0];
    const openingRows = statementOpeningRows.filter((row) => {
        if (
            row.date === firstOpeningDate ||
            statementOpeningRows.filter(
                (other) => other.currency === row.currency,
            ).length !== 1
        )
            return true;
        const priorMovements = bankRows.filter(
            (movement) =>
                movement.currency === row.currency &&
                movement.date >= firstOpeningDate &&
                movement.date < row.date,
        );
        // A later first-currency anchor can confirm the balance already
        // reconstructed from recorded movements; it must not hide that history.
        return (
            priorMovements.length === 0 ||
            Math.abs(
                priorMovements.reduce(
                    (sum, movement) => sum + Number(movement.amount),
                    0,
                ) - Number(row.amount),
            ) > 1e-8
        );
    });
    const openingDatesByCurrency = new Map<string, string>();
    const conflictingCurrencies = new Set<string>();
    for (const row of openingRows) {
        const previous = openingDatesByCurrency.get(row.currency);
        if (previous && previous !== row.date) {
            conflictingCurrencies.add(row.currency);
        }
        openingDatesByCurrency.set(row.currency, row.date);
    }
    const openingBalanceDate = conflictingCurrencies.size
        ? null
        : ([...openingDatesByCurrency.values()].sort().at(-1) ?? null);
    const openingBalances = new Map<string, number>();
    if (openingRows.length === 0) {
        flags.push(
            "No opening bank balance; cash balance and runway are unavailable.",
        );
    } else if (conflictingCurrencies.size) {
        flags.push(
            `Conflicting opening-balance dates for ${[...conflictingCurrencies].sort().join(", ")}; keep one statement-backed anchor per currency before calculating cash.`,
        );
    } else if (openingBalanceDate) {
        for (const row of openingRows) {
            addAmount(openingBalances, row.currency, Number(row.amount));
        }
        for (const [currency, date] of openingDatesByCurrency) {
            for (const row of bankRows) {
                if (
                    row.currency === currency &&
                    row.date >= date &&
                    row.date < openingBalanceDate
                ) {
                    addAmount(openingBalances, currency, Number(row.amount));
                }
            }
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
        if (
            isVendorLedgerBalanceRow(row) ||
            !balanceAware.issues.has(row.vendor)
        )
            continue;
        const category = cloudCategory(row);
        if (automaticForecastRule(row.vendor, category, privateRules)) {
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
            const values: Record<string, number | null> = {};
            const actualIssues: Record<string, string> = {};
            const cellAssumptions: Record<string, RunwayAssumption[]> = {};
            for (const column of columnSpecs) {
                const actual =
                    column.kind === "actual" || column.kind === "current";
                values[column.id] = actual
                    ? (actualByMonth.get(column.month)?.get(key) ?? null)
                    : (forecastByMonth.get(column.month)?.get(key) ?? 0);
                if (actual) {
                    const issue = actualIssuesByCell.get(
                        `${column.month}\u0000${key}`,
                    );
                    if (issue) actualIssues[column.id] = issue;
                    if (
                        STRIPE_LINES.includes(identity.vendor) &&
                        relevantStripeSales.some(
                            (sale) =>
                                sale.month === column.month &&
                                sale.coverage_complete !== 1,
                        )
                    )
                        actualIssues[column.id] =
                            "Calendar-month sales coverage is incomplete";
                }
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
                privateRules,
            );
            const creditValues: Record<string, number> = {};
            for (const column of columnSpecs) {
                const credit = (
                    column.kind === "forecast"
                        ? forecastCreditsByMonth
                        : creditFundedByMonth
                )
                    .get(column.month)
                    ?.get(key);
                if (credit != null && Math.abs(credit) > 0.005) {
                    creditValues[column.id] = credit;
                }
            }
            const detailFields =
                identity.category !== "revenue"
                    ? []
                    : identity.vendor === "stripe sales"
                      ? ([
                            ["Gross customer payments", "gross_sales", 1],
                            ["Stripe fees", "stripe_fees", -1],
                        ] as const)
                      : [];
            const details =
                stripeSalesUsable || stripeForecastUsable
                    ? detailFields.map(([label]) => ({
                          label,
                          values: {} as Record<string, number>,
                      }))
                    : [];
            for (const column of columnSpecs) {
                const source =
                    column.kind === "forecast"
                        ? identity.vendor === "stripe sales"
                            ? salesForecastRows(
                                  latestStripeSales,
                                  column.month,
                                  new Date(`${review.asOf}T23:59:59Z`),
                                  privateRules?.["stripe sales|revenue"]
                                      ?.salesStoppedFrom,
                              )
                            : latestStripeSales
                        : relevantStripeSales.filter(
                              (row) => row.month === column.month,
                          );
                if (
                    !source.length ||
                    !details.length ||
                    (column.kind === "forecast"
                        ? !stripeForecastUsable
                        : !stripeSalesUsable)
                )
                    continue;
                const amounts = detailFields.map(([, field, sign]) =>
                    source.reduce(
                        (sum, row) =>
                            sum +
                            toUsd(
                                sign *
                                    (row[field] +
                                        (field === "stripe_fees"
                                            ? -row.dispute_fees
                                            : 0)),
                                row.currency,
                                column.month,
                            ),
                        0,
                    ),
                );
                // A reviewed zero forecast needs no breakdown. Other overrides
                // must reconcile exactly before showing inferred components.
                if (column.kind === "forecast" && values[column.id] === 0)
                    amounts.fill(0);
                if (
                    Math.abs(
                        amounts.reduce((sum, amount) => sum + amount, 0) -
                            (values[column.id] ?? 0),
                    ) > 0.005
                )
                    continue;
                details.forEach((detail, index) => {
                    detail.values[column.id] = amounts[index];
                });
            }
            return {
                ...identity,
                ...(Object.keys(actualIssues).length ? { actualIssues } : {}),
                ...(details.length ? { details } : {}),
                ...(Object.keys(creditValues).length > 0
                    ? { creditValues }
                    : {}),
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
    rows.sort(
        (a, b) =>
            categoryRank(a.category) - categoryRank(b.category) ||
            a.category.localeCompare(b.category) ||
            a.vendor.localeCompare(b.vendor),
    );
    const unmodeledRows = rows.filter(
        (row) =>
            row.forecastMethod == null &&
            (row.values[`${review.baselineMonth}:actual`] != null ||
                row.actualIssues?.[`${review.baselineMonth}:actual`]),
    );
    for (const row of rows) {
        if (fundedCashLines.has(matrixKey(row.category, row.vendor))) {
            row.forecastIssue = "Paid usage conflicts with the funded forecast";
            flags.push(
                `${row.vendor} (${row.category}) has recent cash-funded usage; review its funded forecast before relying on zero future cash cost.`,
            );
            continue;
        }
        row.forecastIssue =
            balanceAware.issues.get(row.vendor) ??
            (!stripeForecastUsable && STRIPE_LINES.includes(row.vendor)
                ? "Stripe month coverage is incomplete"
                : unmodeledRows.includes(row)
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
    const creditObservationDate = cloudRows
        .filter(
            (row) =>
                isVendorLedgerBalanceRow(row) &&
                row.credit > 0 &&
                row.start.slice(0, 10) <= now.toISOString().slice(0, 10),
        )
        .map((row) => row.start.slice(0, 10))
        .sort()
        .at(-1);
    const forecastTimingNote =
        latestTransactionDate &&
        creditObservationDate &&
        creditObservationDate > latestTransactionDate.slice(0, 10)
            ? `Latest recorded Bank entry: ${latestTransactionDate.slice(0, 10)}; credit balances checked through ${creditObservationDate}. The intervening usage and cash movements are not reconciled; the forecast uses the reviewed run-rate assumptions.`
            : null;
    const currentCashUsd = cashBalanceByMonth.get(currentMonth) ?? null;
    const currentPlan = forecastByMonth.get(currentMonth);
    const planComplete = forecastUsable && unmodeledRows.length === 0;
    // Closed months use recorded cash. Current Wise movements never offset
    // this full-month plan; a stale review cannot silently replace closed months.
    const openingPlanCash = cashBalanceByMonth.get(priorMonth);
    const projectedMonthEndCashUsd =
        planComplete && currentPlan && openingPlanCash != null
            ? openingPlanCash +
              [...currentPlan.values()].reduce((sum, value) => sum + value, 0)
            : null;

    let projectedCash = projectedMonthEndCashUsd;
    let projectionGap = false;
    const columns: RunwayColumn[] = columnSpecs.map((column) => {
        const actual = column.kind !== "forecast";
        const monthHasBank = cashActualByMonth.has(column.month);
        const hasCosts = rows.some(
            (row) =>
                row.category !== "revenue" &&
                row.category !== "balance_sheet" &&
                row.values[column.id] != null,
        );
        const missingCosts = rows.some(
            (row) =>
                row.category !== "revenue" &&
                row.category !== "balance_sheet" &&
                row.actualIssues?.[column.id],
        );
        const missingSales =
            STRIPE_LINES.some((vendor) =>
                identities.has(matrixKey("revenue", vendor)),
            ) &&
            (!stripeSalesUsable ||
                !relevantStripeSales.some(
                    (sale) =>
                        sale.month === column.month &&
                        sale.coverage_complete === 1,
                ));
        const totalExpensesUsd =
            actual && !hasCosts
                ? null
                : sumRecorded(
                      rows
                          .filter(
                              (row) =>
                                  row.category !== "revenue" &&
                                  row.category !== "balance_sheet",
                          )
                          .map((row) => row.values[column.id]),
                  );
        const totalCreditUsd =
            actual && !hasCosts
                ? null
                : rows
                      .filter(
                          (row) =>
                              row.category !== "revenue" &&
                              row.category !== "balance_sheet",
                      )
                      .reduce(
                          (sum, row) =>
                              sum + (row.creditValues?.[column.id] ?? 0),
                          0,
                      );
        const netUsd =
            column.kind === "forecast"
                ? rows.reduce(
                      (sum, row) => sum + (row.values[column.id] ?? 0),
                      0,
                  )
                : !monthHasBank
                  ? null
                  : [
                        ...(cashActualByMonth.get(column.month)?.values() ??
                            []),
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
            projectedCash += netUsd ?? 0;
            runningCashUsd = projectedCash;
        }
        const operatingResultUsd =
            actual &&
            (totalExpensesUsd == null ||
                !stripeSalesUsable ||
                !relevantStripeSales.some(
                    (sale) => sale.month === column.month,
                ))
                ? null
                : rows
                      .filter((row) => row.category !== "balance_sheet")
                      .reduce(
                          (sum, row) => sum + (row.values[column.id] ?? 0),
                          0,
                      );
        let cashBridge: RunwayColumn["cashBridge"];
        if (
            actual &&
            monthHasBank &&
            bankCurrenciesUsable &&
            !missingSales &&
            operatingResultUsd != null &&
            totalExpensesUsd != null
        ) {
            const revenue = operatingResultUsd - totalExpensesUsd;
            let receipts = 0;
            let payments = 0;
            let otherCash = 0;
            for (const [key, amount] of cashActualByMonth.get(column.month) ??
                []) {
                const category = key.split("\u0000")[0];
                if (category === "revenue") receipts += amount;
                else if (category === "balance_sheet") otherCash += amount;
                else payments += amount;
            }
            // Explanation only: cash totals still come directly from Bank.
            cashBridge = {
                revenue,
                expenses: totalExpensesUsd,
                receiptsDifference: receipts - revenue,
                paymentsDifference: payments - totalExpensesUsd,
                otherCash,
                exchangeRates: fxRevaluationValues[column.id] ?? 0,
            };
        }
        return {
            ...column,
            ...(cashBridge ? { cashBridge } : {}),
            provisional:
                actual &&
                (column.kind === "current" || missingCosts || missingSales),
            forecastComplete: column.kind !== "forecast" || planComplete,
            totalExpensesUsd,
            totalCreditUsd,
            operatingResultUsd,
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
        forecastTimingNote,
        currentCashUsd,
        review,
        fundingProvisional: balanceAware.fundingGaps.length > 0,
        projectedMonthEndCashUsd,
        runwayMonths,
        runwayExhaustedMonth,
        runwayCapped,
        flags: [...new Set(flags)],
        billingNotices: [...new Set(balanceAware.notices ?? [])],
    };
}

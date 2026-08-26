import type { Data, OpCloudRow, OpTransactionRow } from "../types";
import {
    categoryLabel,
    cloudCategory,
    EXPENSE_CATEGORY_ORDER,
    isBankMovement,
    isComputeOrInfrastructureCategory,
    transactionCategory,
} from "./categories";
import { toUsd } from "./fx";
import {
    type MonthFilterValue,
    matchesMonth,
    monthLabel,
    WINDOW_START,
} from "./months";
import {
    activeProviderAccounts,
    type MeteringBasis,
    meterDriftExplanation,
    type ProviderReconciliationExplanation,
    pollenWitnessExplanation,
    providerMeteringBasis,
    resolveProvider,
} from "./providerRegistry";

// ---------------------------------------------------------- transactions

export const CATEGORY_ORDER = EXPENSE_CATEGORY_ORDER;

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

function getOrInit<K, V>(map: Map<K, V>, key: K, make: () => V): V {
    let value = map.get(key);
    if (value === undefined) {
        value = make();
        map.set(key, value);
    }
    return value;
}

function opTransactionUsd(row: OpTransactionRow): number {
    return toUsd(row.amount, row.currency, row.date);
}

export function opCloudMonth(row: Pick<OpCloudRow, "start">): string {
    return row.start.slice(0, 7);
}

export function isOpCloudBalanceRow(row: Pick<OpCloudRow, "type">): boolean {
    return row.type.trim().toLowerCase() === "balance";
}

// Signed burn: a refund (positive `paid`) reduces the vendor bill instead of
// being dropped. Every lens — Providers, GPU, credits — must share these two
// helpers so refund months can never disagree across tabs.
export function opCloudPaidBurnUsd(
    row: Pick<OpCloudRow, "currency" | "paid" | "start" | "type">,
): number {
    if (isOpCloudBalanceRow(row)) return 0;
    return -toUsd(row.paid, row.currency, row.start);
}

export function opCloudCreditBurnUsd(
    row: Pick<OpCloudRow, "credit" | "currency" | "start" | "type">,
): number {
    if (isOpCloudBalanceRow(row)) return 0;
    return Math.max(0, -toUsd(row.credit, row.currency, row.start));
}

type PnlMonth = {
    month: string;
    revenueNetUsd: number | null;
    categories: Record<string, number>;
    spendUsd: number | null;
    cashPnlUsd: number | null;
    monthInProgress: boolean;
};

export function pnlByMonth(data: Data, now: Date): PnlMonth[] {
    // Wise cash lands near real time, so only the current calendar month is
    // still filling — everything before it is complete.
    const currentMonth = now.toISOString().slice(0, 7);

    const months = new Set<string>();
    for (const row of (data.opTransactions ?? []).filter(isBankMovement)) {
        months.add(row.date.slice(0, 7));
    }

    return [...months]
        .filter((month) => MONTH_KEY_RE.test(month) && month >= WINDOW_START)
        .sort()
        .map((month) => {
            const categories: Record<string, number> = {};
            let revenue = 0;
            let hasRevenue = false;
            for (const row of (data.opTransactions ?? []).filter(
                isBankMovement,
            )) {
                if (row.date.slice(0, 7) !== month) continue;
                const amountUsd = opTransactionUsd(row);
                const category = transactionCategory(row);
                if (category === "revenue") {
                    revenue += amountUsd;
                    hasRevenue = true;
                    continue;
                }
                if (category === "balance_sheet") continue;
                categories[category] = (categories[category] ?? 0) - amountUsd;
            }
            const hasTransactions = Object.keys(categories).length > 0;
            const spendUsd = hasTransactions
                ? Object.values(categories).reduce((a, b) => a + b, 0)
                : null;

            const revenueNetUsd = hasRevenue ? revenue : null;
            return {
                month,
                revenueNetUsd,
                categories,
                spendUsd,
                cashPnlUsd:
                    revenueNetUsd != null && spendUsd != null
                        ? revenueNetUsd - spendUsd
                        : null,
                monthInProgress: month >= currentMonth,
            };
        });
}

export function categoryColumns(rows: PnlMonth[]): string[] {
    const known = new Set<string>(CATEGORY_ORDER);
    const extra = new Set<string>();
    for (const row of rows) {
        for (const category of Object.keys(row.categories)) {
            if (!known.has(category)) extra.add(category);
        }
    }
    return [...CATEGORY_ORDER, ...[...extra].sort()];
}

// -------------------------------------------------------- P&L statement

export type PnlPeriod = {
    key: string; // 'YYYY-MM' | 'total' | 'delta'
    label: string;
    kind: "month" | "total" | "delta";
    month?: string; // for kind==='month'
    inProgress?: boolean;
};

export type PnlVendorLine = {
    vendor: string;
    values: Record<string, number | null>; // periodKey → usd
};

export type PnlLine = {
    key: string; // 'revenue' | category | 'total-spend' | 'cash-pnl' | 'net-margin'
    label: string;
    kind: "revenue" | "category" | "total-spend" | "cash-pnl" | "net-margin";
    values: Record<string, number | null>; // periodKey → usd (net-margin: ratio*100)
    pctOfRevenue: number | null; // on the primary period
    vendors?: PnlVendorLine[]; // category lines only
};

// net-margin as a percentage: cash P&L ÷ revenue. Null when either side is
// missing or revenue is zero — a ratio against no revenue is meaningless.
function netMarginPct(
    cashPnl: number | null,
    revenue: number | null,
): number | null {
    if (cashPnl == null || revenue == null || revenue === 0) return null;
    return (cashPnl / revenue) * 100;
}

// One classic P&L statement: line items are rows, periods are columns. The
// rows never change with the filter — only the period columns do. Year/all
// lays out each in-window month ascending plus a YTD total; a month lays out
// prior · selected · Δ (selected − prior). Reuses pnlByMonth for the per-month
// facts, then pivots line × period.
export function pnlStatement(
    data: Data,
    filter: MonthFilterValue,
    now: Date,
): { periods: PnlPeriod[]; lines: PnlLine[]; primary: string } {
    const byMonth = new Map(
        pnlByMonth(data, now).map((row) => [row.month, row]),
    );
    const isMonth = typeof filter === "string" && MONTH_KEY_RE.test(filter);

    // Period columns and the primary period key (%rev denominator).
    let periods: PnlPeriod[];
    let primary: string;
    if (isMonth) {
        const selected = filter;
        const prior = monthShift(selected, -1);
        periods = [
            {
                key: prior,
                label: monthLabel(prior),
                kind: "month",
                month: prior,
                inProgress: byMonth.get(prior)?.monthInProgress ?? false,
            },
            {
                key: selected,
                label: monthLabel(selected),
                kind: "month",
                month: selected,
                inProgress: byMonth.get(selected)?.monthInProgress ?? false,
            },
            { key: "delta", label: "Δ MoM", kind: "delta" },
        ];
        primary = selected;
    } else {
        const totalLabel =
            Array.isArray(filter) && filter.length > 0 ? "Total" : "YTD";
        const months = [...byMonth.keys()]
            .filter((month) => matchesMonth(month, filter))
            .sort();
        periods = [
            ...months.map(
                (month): PnlPeriod => ({
                    key: month,
                    label: monthLabel(month),
                    kind: "month",
                    month,
                    inProgress: byMonth.get(month)?.monthInProgress ?? false,
                }),
            ),
            { key: "total", label: totalLabel, kind: "total" },
        ];
        primary = "total";
    }

    const monthKeys = periods
        .filter((period) => period.kind === "month")
        .map((period) => period.key);

    // Fill a line's month values, then derive its synthetic column (total =
    // sum across visible months; delta = selected − prior). sum() keeps null
    // when every contributing month is null, mirroring cashPnl semantics.
    const fill = (
        pick: (row: PnlMonth) => number | null,
    ): Record<string, number | null> => {
        const values: Record<string, number | null> = {};
        for (const month of monthKeys) {
            const row = byMonth.get(month);
            values[month] = row ? pick(row) : null;
        }
        if (isMonth) {
            const [prior, selected] = monthKeys;
            values.delta = subtract(values[selected], values[prior]);
        } else {
            values.total = sumValues(monthKeys.map((month) => values[month]));
        }
        return values;
    };

    const revenueLine = fill((row) => row.revenueNetUsd);
    const spendLine = fill((row) => row.spendUsd);
    const cashPnlLine = fill((row) => row.cashPnlUsd);

    const netMarginLine: Record<string, number | null> = {};
    for (const period of periods.filter(
        (candidate) => candidate.kind !== "delta",
    )) {
        netMarginLine[period.key] = netMarginPct(
            cashPnlLine[period.key],
            revenueLine[period.key],
        );
    }
    if (isMonth) {
        const [prior, selected] = monthKeys;
        netMarginLine.delta = subtract(
            netMarginLine[selected],
            netMarginLine[prior],
        );
    }

    const pctOf = (values: Record<string, number | null>): number | null => {
        const revenue = revenueLine[primary];
        const value = values[primary];
        if (value == null || revenue == null || revenue === 0) return null;
        return (value / revenue) * 100;
    };

    // Category rows follow CATEGORY_ORDER then any extras sorted, same as
    // categoryColumns. Each carries vendor sub-rows in the same period columns;
    // vendor rows sum to the category row for every period by construction.
    const categories = categoryColumns([...byMonth.values()]);
    const vendorsByCategory = pnlVendorLines(data, monthKeys, isMonth);

    const categoryLines: PnlLine[] = categories.map((category) => {
        const values = fill((row) => row.categories[category] ?? null);
        return {
            key: category,
            label: categoryLabel(category),
            kind: "category",
            values,
            pctOfRevenue: pctOf(values),
            vendors: vendorsByCategory.get(category) ?? [],
        };
    });

    const lines: PnlLine[] = [
        {
            key: "revenue",
            label: "Revenue (net)",
            kind: "revenue",
            values: revenueLine,
            pctOfRevenue: pctOf(revenueLine),
        },
        ...categoryLines,
        {
            key: "total-spend",
            label: "Total spend",
            kind: "total-spend",
            values: spendLine,
            pctOfRevenue: pctOf(spendLine),
        },
        {
            key: "cash-pnl",
            label: "Cash P&L",
            kind: "cash-pnl",
            values: cashPnlLine,
            pctOfRevenue: pctOf(cashPnlLine),
        },
        {
            key: "net-margin",
            label: "Net margin",
            kind: "net-margin",
            values: netMarginLine,
            pctOfRevenue: netMarginLine[primary],
        },
    ];

    return { periods, lines, primary };
}

// Keeps null when every contributing month is null; otherwise sums the present
// months (a partially-witnessed total still surfaces).
function sumValues(values: (number | null)[]): number | null {
    const present = values.filter((value): value is number => value != null);
    if (present.length === 0) return null;
    return present.reduce((a, b) => a + b, 0);
}

// Δ = selected − prior. Null when either side is missing — a delta against an
// absent month is not zero.
function subtract(a: number | null, b: number | null): number | null {
    if (a == null || b == null) return null;
    return a - b;
}

// Walk op_transactions once, bucketed by category | vendor then by month.
// Emits, per category, vendor sub-rows carrying the same period keys (plus the
// synthetic total/delta) as the category line, so they sum to it exactly.
function pnlVendorLines(
    data: Data,
    monthKeys: string[],
    isMonth: boolean,
): Map<string, PnlVendorLine[]> {
    const monthSet = new Set(monthKeys);
    // category → vendor → month → usd
    const byCategory = new Map<string, Map<string, Map<string, number>>>();
    for (const row of (data.opTransactions ?? []).filter(isBankMovement)) {
        const category = transactionCategory(row);
        if (category === "revenue" || category === "balance_sheet") continue;
        const month = row.date.slice(0, 7);
        if (!monthSet.has(month)) continue;
        const vendors = getOrInit(
            byCategory,
            category,
            () => new Map<string, Map<string, number>>(),
        );
        const months = getOrInit(
            vendors,
            row.vendor,
            () => new Map<string, number>(),
        );
        months.set(month, (months.get(month) ?? 0) - opTransactionUsd(row));
    }

    const result = new Map<string, PnlVendorLine[]>();
    for (const [category, vendors] of byCategory) {
        const lines: PnlVendorLine[] = [...vendors.entries()].map(
            ([vendor, months]) => {
                const values: Record<string, number | null> = {};
                for (const month of monthKeys) {
                    values[month] = months.get(month) ?? null;
                }
                if (isMonth) {
                    const [prior, selected] = monthKeys;
                    values.delta = subtract(values[selected], values[prior]);
                } else {
                    values.total = sumValues(
                        monthKeys.map((month) => values[month]),
                    );
                }
                return { vendor, values };
            },
        );
        // Largest vendor first on the primary column, then by name.
        const primary = isMonth ? "delta" : "total";
        lines.sort(
            (a, b) =>
                (b.values[primary] ?? 0) - (a.values[primary] ?? 0) ||
                a.vendor.localeCompare(b.vendor),
        );
        result.set(category, lines);
    }
    return result;
}

// ------------------------------------------------------ vendor three-way

// Vendors funded by prepaid balance top-ups: cash precedes usage by more
// than a month, so monthly cash matching is meaningless — coverage holds as
// long as cumulative cash keeps up with cumulative paid burn.
const PREPAID_VENDORS = new Set([
    "vast.ai",
    "deepinfra",
    "pruna",
    "fal",
    "mistral",
    "runpod",
]);

// Pollen activity below this is noise, not a funding question.
const POLLEN_ACTIVE_USD = 1;

// Provider paid amounts at or below this never raise funding warnings.
const PROVIDER_PAID_FLOOR_USD = 1;

// Slack for prepaid cumulative matching (FX drift, fees, cents).
const PREPAID_EPS_USD = 50;

type OpCloudWitness = {
    paidUsd: number;
    creditUsd: number;
    cloudUsd: number;
    meterCloudUsd: number;
};

type OpPollenWitness = {
    paidCostUsd: number;
    questCostUsd: number;
    totalCostUsd: number;
};

type CashCoverage =
    | "same month"
    | "cash ±1mo"
    | "prepaid"
    | "credit funded"
    | "missing cash"
    | null;

type MeterCoverage = "complete" | "missing cloud" | "missing pollen" | null;

export type DataQualityStatus =
    | "ok"
    | "explained"
    | "cash only"
    | "timing"
    | "missing cash"
    | "missing cloud"
    | "missing pollen"
    | "variance"
    | "drift";

export type VendorPlanes = {
    month: string;
    vendor: string;
    meteringBasis: MeteringBasis;
    cashUsd: number | null;
    cloudPaidUsd: number | null;
    cloudCreditUsd: number | null;
    cloudUsd: number | null;
    meterCloudUsd: number | null;
    pollenPaidCostUsd: number | null;
    pollenQuestCostUsd: number | null;
    pollenCostUsd: number | null;
    calibX: number | null;
    cashCoverage: CashCoverage;
    meterCoverage: MeterCoverage;
    reconciliationExplanation: ProviderReconciliationExplanation | null;
    status: DataQualityStatus;
};

export function monthShift(month: string, delta: number): string {
    const total =
        Number(month.slice(0, 4)) * 12 +
        (Number(month.slice(5, 7)) - 1) +
        delta;
    const year = Math.floor(total / 12);
    const mon = (total % 12) + 1;
    return `${String(year).padStart(4, "0")}-${String(mon).padStart(2, "0")}`;
}

function nonZeroOrNull(value: number): number | null {
    return Math.abs(value) > 0.0001 ? value : null;
}

function activePositive(value: number | null, floor: number): boolean {
    return value != null && value > floor;
}

// Paid cloud burn must be funded by Wise cash: same-month cash, an adjacent
// invoice settlement, or a prepaid balance whose cumulative top-ups cover
// cumulative paid burn. Credit-funded burn is valid without cash.
function cashCoverageFor({
    cash,
    cashUsd,
    cloudCreditUsd,
    cloudPaidUsd,
    cumulative,
    month,
    vendor,
}: {
    cash: Map<string, number>;
    cashUsd: number | null;
    cloudCreditUsd: number | null;
    cloudPaidUsd: number | null;
    cumulative: Map<string, { cashUsd: number; paidUsd: number }>;
    month: string;
    vendor: string;
}): CashCoverage {
    const paidActive = activePositive(cloudPaidUsd, PROVIDER_PAID_FLOOR_USD);
    const creditActive = activePositive(
        cloudCreditUsd,
        PROVIDER_PAID_FLOOR_USD,
    );
    const sameMonthCash = activePositive(cashUsd, PROVIDER_PAID_FLOOR_USD);
    const cashNear =
        (cash.get(`${monthShift(month, -1)}|${vendor}`) ?? 0) >
            PROVIDER_PAID_FLOOR_USD ||
        (cash.get(`${monthShift(month, 1)}|${vendor}`) ?? 0) >
            PROVIDER_PAID_FLOOR_USD;

    if (!paidActive) {
        if (creditActive) return "credit funded";
        if (sameMonthCash && PREPAID_VENDORS.has(vendor)) return "prepaid";
        return null;
    }

    if (sameMonthCash) return "same month";
    if (cashNear) return "cash ±1mo";

    if (PREPAID_VENDORS.has(vendor)) {
        const run = cumulative.get(`${month}|${vendor}`);
        const funded =
            run != null && run.cashUsd + PREPAID_EPS_USD >= run.paidUsd;
        if (funded) return "prepaid";
    }

    return "missing cash";
}

// Raw month ratio: what $1 of our metering cost at the provider that month.
function monthCalib(
    meterCloudUsd: number | null,
    pollenCostUsd: number | null,
): number | null {
    if (meterCloudUsd == null || pollenCostUsd == null || pollenCostUsd === 0)
        return null;
    return meterCloudUsd / pollenCostUsd;
}

function meterCoverageFor({
    cashCoverage,
    cashUsd,
    cloudCreditUsd,
    cloudPaidUsd,
    expectsCloudMeter,
    meterCloudUsd,
    pollenPriced,
    pollenCostUsd,
}: {
    cashCoverage: CashCoverage;
    cashUsd: number | null;
    cloudCreditUsd: number | null;
    cloudPaidUsd: number | null;
    expectsCloudMeter: boolean;
    meterCloudUsd: number | null;
    pollenPriced: boolean;
    pollenCostUsd: number | null;
}): MeterCoverage {
    const cashActive = activePositive(cashUsd, PROVIDER_PAID_FLOOR_USD);
    const cloudLedgerActive =
        activePositive(cloudPaidUsd, PROVIDER_PAID_FLOOR_USD) ||
        activePositive(cloudCreditUsd, PROVIDER_PAID_FLOOR_USD);
    const meterCloudPresent = meterCloudUsd != null;
    const pollenPresent = pollenCostUsd != null;
    const meterCloudActive = activePositive(meterCloudUsd, POLLEN_ACTIVE_USD);
    const pollenActive = activePositive(pollenCostUsd, POLLEN_ACTIVE_USD);

    // Thresholds suppress one-sided noise; they must not erase a real witness.
    // If both ledgers contain a non-zero value, coverage is complete even when
    // one side is below $1 (for example a low-volume model or calibration gap).
    if (meterCloudPresent && pollenPresent) return "complete";
    // These providers are intentionally priced from the Pollen ledger itself;
    // there is no separate external provider bill to witness.
    if (pollenPriced && pollenPresent) return "complete";
    if (
        !meterCloudPresent &&
        (pollenActive ||
            (expectsCloudMeter &&
                cashActive &&
                !cloudLedgerActive &&
                cashCoverage !== "prepaid"))
    )
        return "missing cloud";
    if (meterCloudActive && !pollenPresent) return "missing pollen";
    return null;
}

function dataQualityStatus({
    calibX,
    cashCoverage,
    cashUsd,
    cloudCreditUsd,
    cloudPaidUsd,
    meterCloudUsd,
    meterCoverage,
    meteringBasis,
    pollenCostUsd,
}: {
    calibX: number | null;
    cashCoverage: CashCoverage;
    cashUsd: number | null;
    cloudCreditUsd: number | null;
    cloudPaidUsd: number | null;
    meterCloudUsd: number | null;
    meterCoverage: MeterCoverage;
    meteringBasis: MeteringBasis;
    pollenCostUsd: number | null;
}): DataQualityStatus {
    if (cashCoverage === "missing cash") return "missing cash";
    if (meterCoverage === "missing cloud") return "missing cloud";
    if (meterCoverage === "missing pollen") return "missing pollen";
    if (hasCalibDrift({ calibX, meterCloudUsd, pollenCostUsd })) {
        return meteringBasis === "direct" ? "drift" : "variance";
    }
    if (cashCoverage === "cash ±1mo" || cashCoverage === "prepaid")
        return "timing";
    if (
        activePositive(cashUsd, PROVIDER_PAID_FLOOR_USD) &&
        !activePositive(cloudPaidUsd, PROVIDER_PAID_FLOOR_USD) &&
        !activePositive(cloudCreditUsd, PROVIDER_PAID_FLOOR_USD) &&
        !activePositive(meterCloudUsd, POLLEN_ACTIVE_USD) &&
        !activePositive(pollenCostUsd, POLLEN_ACTIVE_USD)
    )
        return "cash only";
    return "ok";
}

// One cloud spend, three OP witnesses: transactions (Wise cash), cloud
// (vendor/provider billing), and pollen (our product meter). A missing
// witness stays null, never zero.
export function vendorPlanes(data: Data): VendorPlanes[] {
    const cash = new Map<string, number>();
    const cloudMeterVendors = new Set<string>();
    const displayKeys = new Set<string>();
    const cumulativeKeys = new Set<string>();
    const infraCloudKeys = new Set<string>();
    const nonInfraCloudKeys = new Set<string>();
    for (const row of (data.opTransactions ?? []).filter(isBankMovement)) {
        if (transactionCategory(row) !== "compute") continue;
        const month = row.date.slice(0, 7);
        if (!MONTH_KEY_RE.test(month)) continue;
        const key = `${month}|${row.vendor}`;
        cash.set(key, (cash.get(key) ?? 0) - opTransactionUsd(row));
        cumulativeKeys.add(key);
    }

    const cloud = new Map<string, OpCloudWitness>();
    for (const row of data.opCloud ?? []) {
        // Community rows are publisher rewards, not an external provider bill.
        // Their OP Pollen provider cost is deliberately normalized to zero.
        if (row.vendor === "community") continue;
        const month = opCloudMonth(row);
        if (!MONTH_KEY_RE.test(month)) continue;
        const key = `${month}|${row.vendor}`;
        const category = cloudCategory(row);
        if (category === "infrastructure") {
            infraCloudKeys.add(key);
            continue;
        }
        if (category !== "compute") continue;
        const paidUsd = opCloudPaidBurnUsd(row);
        const creditUsd = opCloudCreditBurnUsd(row);
        const cloudUsd = paidUsd + creditUsd;
        const meterCloudUsd = cloudUsd;
        if (Math.abs(meterCloudUsd) > POLLEN_ACTIVE_USD) {
            cloudMeterVendors.add(row.vendor);
        }
        if (
            Math.abs(paidUsd) <= 0.0001 &&
            Math.abs(creditUsd) <= 0.0001 &&
            Math.abs(meterCloudUsd) <= 0.0001
        ) {
            continue;
        }
        const entry = getOrInit(cloud, key, () => ({
            paidUsd: 0,
            creditUsd: 0,
            cloudUsd: 0,
            meterCloudUsd: 0,
        }));
        entry.paidUsd += paidUsd;
        entry.creditUsd += creditUsd;
        entry.cloudUsd += cloudUsd;
        entry.meterCloudUsd += meterCloudUsd;
        nonInfraCloudKeys.add(key);
        cumulativeKeys.add(key);
        if (month >= WINDOW_START) displayKeys.add(key);
    }

    const pollen = new Map<string, OpPollenWitness>();
    for (const row of data.opPollen ?? []) {
        if (!MONTH_KEY_RE.test(row.month) || row.month < WINDOW_START) continue;
        // Community has no external provider bill to reconcile on this tab.
        if (row.vendor === "community") continue;
        const key = `${row.month}|${row.vendor}`;
        const entry = getOrInit(pollen, key, () => ({
            paidCostUsd: 0,
            questCostUsd: 0,
            totalCostUsd: 0,
        }));
        entry.paidCostUsd += toUsd(row.cost_paid, row.currency, row.month);
        entry.questCostUsd += toUsd(row.cost_quests, row.currency, row.month);
        entry.totalCostUsd += toUsd(
            row.cost_paid + row.cost_quests,
            row.currency,
            row.month,
        );
        if (entry.totalCostUsd > POLLEN_ACTIVE_USD) {
            cloudMeterVendors.add(row.vendor);
        }
        displayKeys.add(key);
    }

    for (const key of infraCloudKeys) {
        if (!nonInfraCloudKeys.has(key) && !pollen.has(key)) {
            displayKeys.delete(key);
        }
    }

    // Running cash vs paid burn per vendor, for prepaid-balance coverage.
    const cumulative = new Map<string, { cashUsd: number; paidUsd: number }>();
    const monthsByVendor = new Map<string, string[]>();
    for (const key of cumulativeKeys) {
        const [month, vendor] = key.split("|");
        getOrInit(monthsByVendor, vendor, (): string[] => []).push(month);
    }
    for (const [vendor, months] of monthsByVendor) {
        let cashUsd = 0;
        let paidUsd = 0;
        for (const month of months.sort()) {
            const key = `${month}|${vendor}`;
            cashUsd += cash.get(key) ?? 0;
            const entry = cloud.get(key);
            if (entry) paidUsd += Math.max(0, entry.paidUsd);
            cumulative.set(key, { cashUsd, paidUsd });
        }
    }

    return [...displayKeys].sort().map((key) => {
        const [month, vendor] = key.split("|");
        const meteringBasis = providerMeteringBasis(vendor);
        const cloudEntry = cloud.get(key);
        const cloudPaidUsd = cloudEntry
            ? nonZeroOrNull(cloudEntry.paidUsd)
            : null;
        const cloudCreditUsd = cloudEntry
            ? nonZeroOrNull(cloudEntry.creditUsd)
            : null;
        const cloudUsd = cloudEntry ? nonZeroOrNull(cloudEntry.cloudUsd) : null;
        const meterCloudUsd = cloudEntry
            ? nonZeroOrNull(cloudEntry.meterCloudUsd)
            : null;
        const pollenEntry = pollen.get(key);
        const pollenPaidCostUsd = pollenEntry
            ? nonZeroOrNull(pollenEntry.paidCostUsd)
            : null;
        const pollenQuestCostUsd = pollenEntry
            ? nonZeroOrNull(pollenEntry.questCostUsd)
            : null;
        const pollenCostUsd = pollenEntry
            ? nonZeroOrNull(pollenEntry.totalCostUsd)
            : null;
        const cashUsd = cash.get(key) ?? null;
        const cashCoverage = cashCoverageFor({
            cash,
            cashUsd,
            cloudCreditUsd,
            cloudPaidUsd,
            cumulative,
            month,
            vendor,
        });
        const meterCoverage = meterCoverageFor({
            cashCoverage,
            cashUsd,
            cloudCreditUsd,
            cloudPaidUsd,
            expectsCloudMeter: cloudMeterVendors.has(vendor),
            meterCloudUsd,
            pollenPriced: meteringBasis === "internal",
            pollenCostUsd,
        });
        const calibX = monthCalib(meterCloudUsd, pollenCostUsd);
        const rawStatus = dataQualityStatus({
            calibX,
            cashCoverage,
            cashUsd,
            cloudCreditUsd,
            cloudPaidUsd,
            meterCloudUsd,
            meterCoverage,
            meteringBasis,
            pollenCostUsd,
        });
        const reconciliationExplanation =
            rawStatus === "missing pollen"
                ? (pollenWitnessExplanation(month, vendor) ?? null)
                : rawStatus === "drift"
                  ? (meterDriftExplanation(month, vendor) ?? null)
                  : null;
        return {
            month,
            vendor,
            meteringBasis,
            cashUsd,
            cloudPaidUsd,
            cloudCreditUsd,
            cloudUsd,
            meterCloudUsd,
            pollenPaidCostUsd,
            pollenQuestCostUsd,
            pollenCostUsd,
            calibX,
            cashCoverage,
            meterCoverage,
            reconciliationExplanation,
            status: reconciliationExplanation ? "explained" : rawStatus,
        };
    });
}

export function insightVendorOptions(
    data: Data,
    month: MonthFilterValue = "",
): string[] {
    const vendors = new Set<string>();
    for (const row of (data.opTransactions ?? []).filter(isBankMovement)) {
        if (
            matchesMonth(row.date, month) &&
            isComputeOrInfrastructureCategory(transactionCategory(row)) &&
            row.vendor.trim()
        ) {
            vendors.add(row.vendor.trim());
        }
    }
    for (const row of data.opCloud ?? []) {
        if (matchesMonth(row.start, month) && row.vendor.trim()) {
            vendors.add(row.vendor.trim());
        }
    }
    for (const row of data.opPollen ?? []) {
        if (matchesMonth(row.month, month) && row.vendor.trim()) {
            vendors.add(row.vendor.trim());
        }
    }
    return ["all", ...[...vendors].sort((a, b) => a.localeCompare(b))];
}

// ------------------------------------------------------------- economics

// Vendors priced from our own pollen records rather than an external bill.
// Their calib is 1.00 by construction, a definition rather than a measurement.
// Community has no provider cost; the Pollen usage endpoint normalizes it to 0.
// |calib − 1| beyond this marks a registry mispricing worth fixing.
export const CALIB_DRIFT_ALARM = 0.25;
export const CALIB_DRIFT_ABS_ALARM_USD = 100;

export function providerPollenGapUsd({
    meterCloudUsd,
    pollenCostUsd,
}: Pick<VendorPlanes, "meterCloudUsd" | "pollenCostUsd">): number | null {
    if (meterCloudUsd == null || pollenCostUsd == null) return null;
    return meterCloudUsd - pollenCostUsd;
}

export function hasCalibDrift({
    calibX,
    meterCloudUsd,
    pollenCostUsd,
}: Pick<VendorPlanes, "calibX" | "meterCloudUsd" | "pollenCostUsd">): boolean {
    if (calibX == null || meterCloudUsd == null || pollenCostUsd == null) {
        return false;
    }
    const gapUsd = providerPollenGapUsd({ meterCloudUsd, pollenCostUsd });
    return (
        Math.abs(calibX - 1) > CALIB_DRIFT_ALARM &&
        gapUsd != null &&
        Math.abs(gapUsd) > CALIB_DRIFT_ABS_ALARM_USD
    );
}

type EconGrain = "vendor" | "model";

export type EconRow = {
    vendor: string;
    model: string | null;
    soldPaidUsd: number;
    ecoPaidUsd: number;
    retainedPaidUsd: number;
    soldQuestsUsd: number;
    // Null when the vendor has no provider bill — provider truth is unknown,
    // never substituted with our own meter.
    trueCostPaidUsd: number | null;
    questBurnUsd: number | null;
    calib: number | null;
    pollenPriced: boolean;
    creditSharePct: number | null;
    trueMultiplier: number | null;
    marginUsd: number | null;
};

function grantFundedUsd(row: EconRow): number | null {
    if (row.trueCostPaidUsd == null) return null;
    if (row.trueCostPaidUsd <= 0) return 0;
    const share = Math.min(100, Math.max(0, row.creditSharePct ?? 0)) / 100;
    return row.trueCostPaidUsd * share;
}

export function providerUsageUsd(row: EconRow): number | null {
    if (row.trueCostPaidUsd == null || row.questBurnUsd == null) return null;
    return row.trueCostPaidUsd + row.questBurnUsd;
}

export function providerGrantFundedUsd(row: EconRow): number | null {
    const usage = providerUsageUsd(row);
    if (usage == null) return null;
    if (usage <= 0) return 0;
    const share = Math.min(100, Math.max(0, row.creditSharePct ?? 0)) / 100;
    return usage * share;
}

export function providerCashCostUsd(row: EconRow): number | null {
    const usage = providerUsageUsd(row);
    const grants = providerGrantFundedUsd(row);
    if (usage == null || grants == null) return null;
    return Math.max(0, usage - grants);
}

function cashCostPaidUsd(row: EconRow): number | null {
    const grants = grantFundedUsd(row);
    if (row.trueCostPaidUsd == null || grants == null) return null;
    return Math.max(0, row.trueCostPaidUsd - grants);
}

export function cashMarginUsd(row: EconRow): number | null {
    const cash = providerCashCostUsd(row);
    if (cash == null) return null;
    return row.retainedPaidUsd - cash;
}

function marginPct(
    marginUsd: number | null,
    retainedPaidUsd: number,
): number | null {
    if (marginUsd == null) return null;
    return retainedPaidUsd > 0 ? (marginUsd / retainedPaidUsd) * 100 : null;
}

export function cashMarginPct(row: EconRow): number | null {
    return marginPct(cashMarginUsd(row), row.retainedPaidUsd);
}

export function trueMarginPct(row: EconRow): number | null {
    return marginPct(row.marginUsd, row.retainedPaidUsd);
}

// Unit economics from OP sources only, one table, two grains: the Vendors
// summary is exactly the Models table rolled up (calib is per-vendor, so
// every dollar column is additive and true × is Σ/Σ).
// - OP Cloud is the provider bill witness (paid + credit burn, excluding infra)
// - OP Pollen is the product meter and paid/quest revenue split
// The math treats the raw data as perfect — calib is a plain
// Σ provider actual / Σ our metering over the scope, no pairing or smoothing.
// A vendor with no provider bill has no calib: its true-cost columns stay
// null ("–") rather than passing our own meter off as the provider's truth.
// Month-level witness gaps surface in Provider Close.
function opEconomics(
    data: Data,
    monthFilter: MonthFilterValue,
    grain: EconGrain,
): EconRow[] {
    type VendorFacts = {
        meteredUsd: number;
        actualUsd: number;
        creditUsd: number;
        hasPollen: boolean;
        hasProvider: boolean;
    };
    const vendors = new Map<string, VendorFacts>();
    const emptyFacts = (): VendorFacts => ({
        meteredUsd: 0,
        actualUsd: 0,
        creditUsd: 0,
        hasPollen: false,
        hasProvider: false,
    });

    for (const row of data.opCloud ?? []) {
        const month = opCloudMonth(row);
        if (!MONTH_KEY_RE.test(month) || month < WINDOW_START) continue;
        if (!matchesMonth(month, monthFilter)) continue;
        if (cloudCategory(row) !== "compute") continue;

        const paidUsd = opCloudPaidBurnUsd(row);
        const creditUsd = opCloudCreditBurnUsd(row);
        const actualUsd = paidUsd + creditUsd;
        if (Math.abs(actualUsd) <= 0.0001 && creditUsd <= 0.0001) continue;

        const facts = getOrInit(vendors, row.vendor, emptyFacts);
        facts.hasProvider = true;
        facts.actualUsd += actualUsd;
        facts.creditUsd += creditUsd;
    }

    type Accumulator = {
        vendor: string;
        model: string | null;
        soldPaid: number;
        eco: number;
        soldQuests: number;
        meteredPaid: number;
        meteredQuests: number;
    };
    const byKey = new Map<string, Accumulator>();
    for (const row of data.opPollen ?? []) {
        if (!MONTH_KEY_RE.test(row.month) || row.month < WINDOW_START) continue;
        if (!matchesMonth(row.month, monthFilter)) continue;
        const facts = getOrInit(vendors, row.vendor, emptyFacts);
        facts.hasPollen = true;
        facts.meteredUsd += toUsd(
            row.cost_paid + row.cost_quests,
            row.currency,
            row.month,
        );
        const key =
            grain === "model" ? `${row.vendor}|${row.model}` : row.vendor;
        const entry = getOrInit(byKey, key, () => ({
            vendor: row.vendor,
            model: grain === "model" ? row.model : null,
            soldPaid: 0,
            eco: 0,
            soldQuests: 0,
            meteredPaid: 0,
            meteredQuests: 0,
        }));
        entry.soldPaid += toUsd(row.price_paid, row.currency, row.month);
        entry.eco += toUsd(
            row.byop_paid + row.model_paid,
            row.currency,
            row.month,
        );
        entry.soldQuests += toUsd(row.price_quests, row.currency, row.month);
        entry.meteredPaid += toUsd(row.cost_paid, row.currency, row.month);
        entry.meteredQuests += toUsd(row.cost_quests, row.currency, row.month);
    }

    type VendorCalib = {
        calib: number | null;
        pollenPriced: boolean;
        creditSharePct: number | null;
    };
    const calibs = new Map<string, VendorCalib>();
    for (const [vendor, facts] of vendors) {
        if (!facts.hasPollen) continue;
        const pollenPriced = providerMeteringBasis(vendor) === "internal";
        let calib: number | null = null;
        if (pollenPriced) {
            calib = 1;
        } else if (facts.hasProvider && facts.meteredUsd > 0) {
            calib = facts.actualUsd / facts.meteredUsd;
        }
        calibs.set(vendor, {
            calib,
            pollenPriced,
            creditSharePct:
                facts.hasProvider && facts.actualUsd > 0
                    ? (facts.creditUsd / facts.actualUsd) * 100
                    : null,
        });
    }

    return [...byKey.values()]
        .map((entry) => {
            const vendorCalib = calibs.get(entry.vendor);
            const calib = vendorCalib?.calib ?? null;
            const trueCostPaidUsd =
                calib == null ? null : entry.meteredPaid * calib;
            const questBurnUsd =
                calib == null ? null : entry.meteredQuests * calib;
            const providerUsage =
                trueCostPaidUsd == null || questBurnUsd == null
                    ? null
                    : trueCostPaidUsd + questBurnUsd;
            const retainedPaidUsd = entry.soldPaid - entry.eco;
            return {
                vendor: entry.vendor,
                model: entry.model,
                soldPaidUsd: entry.soldPaid,
                ecoPaidUsd: entry.eco,
                retainedPaidUsd,
                soldQuestsUsd: entry.soldQuests,
                trueCostPaidUsd,
                questBurnUsd,
                calib,
                pollenPriced: vendorCalib?.pollenPriced ?? false,
                creditSharePct: vendorCalib?.creditSharePct ?? null,
                trueMultiplier:
                    providerUsage != null && providerUsage > 0
                        ? retainedPaidUsd / providerUsage
                        : null,
                marginUsd:
                    providerUsage == null
                        ? null
                        : retainedPaidUsd - providerUsage,
            };
        })
        .sort((a, b) => {
            if (a.trueMultiplier == null && b.trueMultiplier == null) {
                return (b.questBurnUsd ?? 0) - (a.questBurnUsd ?? 0);
            }
            if (a.trueMultiplier == null) return 1;
            if (b.trueMultiplier == null) return -1;
            return a.trueMultiplier - b.trueMultiplier;
        });
}

export function providerEconomics(
    data: Data,
    monthFilter: MonthFilterValue,
): EconRow[] {
    return opEconomics(data, monthFilter, "vendor");
}

export function modelEconomics(
    data: Data,
    monthFilter: MonthFilterValue,
): EconRow[] {
    return opEconomics(data, monthFilter, "model");
}

type EconSummary = {
    soldPaidUsd: number;
    soldQuestsUsd: number;
    trueCostPaidUsd: number;
    cashCostPaidUsd: number;
    grantFundedUsd: number;
    providerUsageUsd: number;
    providerCashCostUsd: number;
    providerGrantFundedUsd: number;
    retainedPaidUsd: number;
    questBurnUsd: number;
    marginUsd: number;
    cashMarginUsd: number;
    marginPct: number | null;
    cashMarginPct: number | null;
    trueMultiplier: number | null; // blended Σ retained / Σ true cost
    cashMultiplier: number | null; // blended Σ retained / Σ cash cost
    creditFundedPct: number | null; // true-cost-weighted credit share
    underwaterCount: number; // rows losing cash on compute (margin < 0)
    unpricedCount: number; // rows without a provider bill — excluded from cost sums
    mostUnderpriced: EconRow | null; // lowest true × in scope
};

// Roll a set of EconRows up to the headline numbers behind the stat cards.
// Blended true × is Σ/Σ, exactly how the table's own math composes, so the
// card can never disagree with the rows under it. Revenue sums cover every
// row; cost and margin sums (and their % denominators) cover only priced
// rows — unpricedCount surfaces the gap instead of guessing at it.
export function econSummary(rows: EconRow[]): EconSummary {
    const acc: EconSummary = {
        soldPaidUsd: 0,
        soldQuestsUsd: 0,
        trueCostPaidUsd: 0,
        cashCostPaidUsd: 0,
        grantFundedUsd: 0,
        providerUsageUsd: 0,
        providerCashCostUsd: 0,
        providerGrantFundedUsd: 0,
        retainedPaidUsd: 0,
        questBurnUsd: 0,
        marginUsd: 0,
        cashMarginUsd: 0,
        marginPct: null,
        cashMarginPct: null,
        trueMultiplier: null,
        cashMultiplier: null,
        creditFundedPct: null,
        underwaterCount: 0,
        unpricedCount: 0,
        mostUnderpriced: null,
    };
    let creditWeighted = 0;
    let creditWeight = 0;
    let pricedRetainedUsd = 0;
    for (const row of rows) {
        acc.soldPaidUsd += row.soldPaidUsd;
        acc.soldQuestsUsd += row.soldQuestsUsd;
        acc.retainedPaidUsd += row.retainedPaidUsd;
        // Every null below shares one cause — the vendor has no provider
        // bill (null calib) — so the guard rejects the row exactly once.
        const rowGrantFundedUsd = grantFundedUsd(row);
        const rowProviderUsageUsd = providerUsageUsd(row);
        const rowProviderCashCostUsd = providerCashCostUsd(row);
        const rowProviderGrantFundedUsd = providerGrantFundedUsd(row);
        const rowCashCostPaidUsd = cashCostPaidUsd(row);
        const rowCashMarginUsd = cashMarginUsd(row);
        if (
            row.trueCostPaidUsd == null ||
            row.questBurnUsd == null ||
            row.marginUsd == null ||
            rowGrantFundedUsd == null ||
            rowProviderUsageUsd == null ||
            rowProviderCashCostUsd == null ||
            rowProviderGrantFundedUsd == null ||
            rowCashCostPaidUsd == null ||
            rowCashMarginUsd == null
        ) {
            acc.unpricedCount += 1;
            continue;
        }
        pricedRetainedUsd += row.retainedPaidUsd;
        acc.trueCostPaidUsd += row.trueCostPaidUsd;
        acc.cashCostPaidUsd += rowCashCostPaidUsd;
        acc.grantFundedUsd += rowGrantFundedUsd;
        acc.providerUsageUsd += rowProviderUsageUsd;
        acc.providerCashCostUsd += rowProviderCashCostUsd;
        acc.providerGrantFundedUsd += rowProviderGrantFundedUsd;
        acc.questBurnUsd += row.questBurnUsd;
        acc.marginUsd += row.marginUsd;
        acc.cashMarginUsd += rowCashMarginUsd;
        if (rowCashMarginUsd < 0) acc.underwaterCount += 1;
        if (row.creditSharePct != null && rowProviderUsageUsd > 0) {
            creditWeighted += row.creditSharePct * rowProviderUsageUsd;
            creditWeight += rowProviderUsageUsd;
        }
        if (
            row.trueMultiplier != null &&
            (acc.mostUnderpriced == null ||
                acc.mostUnderpriced.trueMultiplier == null ||
                row.trueMultiplier < acc.mostUnderpriced.trueMultiplier)
        ) {
            acc.mostUnderpriced = row;
        }
    }
    acc.trueMultiplier =
        acc.providerUsageUsd > 0
            ? pricedRetainedUsd / acc.providerUsageUsd
            : null;
    acc.cashMultiplier =
        acc.cashCostPaidUsd > 0
            ? pricedRetainedUsd / acc.cashCostPaidUsd
            : null;
    acc.marginPct = marginPct(acc.marginUsd, pricedRetainedUsd);
    acc.cashMarginPct = marginPct(acc.cashMarginUsd, pricedRetainedUsd);
    acc.creditFundedPct =
        creditWeight > 0 ? creditWeighted / creditWeight : null;
    return acc;
}

// --------------------------------------------------------- credit runway

type GrantStatus = {
    vendor: string;
    label: string;
    grantedUsd: number;
    startDate: string;
    expires: string | null; // null = no expiry
    allocatedUsd: number;
    lapsedUsd: number; // unused capacity of an expired grant
    active: boolean; // not expired, capacity remains
    finishedDate: string | null; // fill month ("YYYY-MM") or expiry date
};

export type RunwayRow = {
    vendor: string;
    grantedUsd: number;
    burnedUsd: number;
    remainingUsd: number;
    lapsedUsd: number;
    unallocatedUsd: number; // burn no grant could absorb
    preWindowBurnUsd: number;
    lastMonthBurnUsd: number;
    currentMonthBurnUsd: number;
    cashLastMonthUsd: number;
    cashCurrentMonthUsd: number;
    monthlyRateUsd: number | null;
    rateBasis: "current" | "last" | "stale" | null;
    depletionDate: string | null; // ISO day
    depletionReason: "burn" | "expiry" | null;
    finished: boolean;
    finishedDate: string | null;
    flags: string[];
    grants: GrantStatus[];
};

const PRE_WINDOW_GRANT_BURN_RESOURCE = "pre-2026 grant burn";

const AVG_DAYS_PER_MONTH = 30.44;
const POOL_EPS_USD = 0.5;

function opCloudDate(value: string): string {
    return value.slice(0, 10);
}

export function isPreWindowGrantBurnRow(
    row: Pick<OpCloudRow, "credit" | "resource_name" | "start">,
): boolean {
    return (
        row.resource_name === PRE_WINDOW_GRANT_BURN_RESOURCE &&
        row.credit < 0 &&
        row.start.slice(0, 7) < WINDOW_START
    );
}

function opCloudGrantStatuses(data: Data): GrantStatus[] {
    const grants: GrantStatus[] = [];
    for (const row of data.opCloud ?? []) {
        if (isOpCloudBalanceRow(row)) continue;
        const grantedUsd = Math.max(
            0,
            toUsd(row.credit, row.currency, row.start),
        );
        if (grantedUsd <= 0) continue;
        grants.push({
            vendor: row.vendor,
            label: row.resource_name,
            grantedUsd,
            startDate: opCloudDate(row.start),
            expires: row.end ? opCloudDate(row.end) : null,
            allocatedUsd: 0,
            lapsedUsd: 0,
            active: true,
            finishedDate: null,
        });
    }
    grants.sort(
        (a, b) =>
            a.vendor.localeCompare(b.vendor) ||
            a.startDate.localeCompare(b.startDate) ||
            a.label.localeCompare(b.label),
    );
    return grants;
}

function opCloudBurnByVendorMonth(data: Data) {
    // plugUsd is the slice of creditUsd from explicit "pre-2026 grant burn"
    // opening-balance rows — the only burn allowed to consume grants whose
    // start metadata postdates it.
    const byVendor = new Map<
        string,
        Map<string, { creditUsd: number; paidUsd: number; plugUsd: number }>
    >();
    for (const row of data.opCloud ?? []) {
        const month = opCloudMonth(row);
        if (!MONTH_KEY_RE.test(month)) continue;
        const creditUsd = opCloudCreditBurnUsd(row);
        const paidUsd = opCloudPaidBurnUsd(row);
        if (creditUsd <= 0 && paidUsd <= 0) continue;
        const months = getOrInit(
            byVendor,
            row.vendor,
            () =>
                new Map<
                    string,
                    { creditUsd: number; paidUsd: number; plugUsd: number }
                >(),
        );
        const entry = getOrInit(months, month, () => ({
            creditUsd: 0,
            paidUsd: 0,
            plugUsd: 0,
        }));
        entry.creditUsd += creditUsd;
        entry.paidUsd += paidUsd;
        if (isPreWindowGrantBurnRow(row)) entry.plugUsd += creditUsd;
    }
    return byVendor;
}

// Allocate each vendor's monthly credit burn to its grants. Pass 1 respects
// each grant's active window (start month ≤ burn month ≤ expiry month),
// oldest grant first — so an expired grant only absorbs burn from its own
// lifetime and its unused remainder LAPSES. Pass 2 re-allocates leftover to
// non-expired grants that had already started by the burn month — burn can
// never consume credit granted later, except the explicit "pre-2026 grant
// burn" opening plugs whose dates predate grant metadata by construction.
// What still doesn't fit is real unallocated burn. Exhaustion (allocated ≈
// granted) marks a grant inactive and records the month it filled.
export function allocateGrants(
    data: Data,
    now: Date,
): { grants: GrantStatus[]; unallocated: Map<string, number> } {
    const today = now.toISOString().slice(0, 10);

    const byVendor = new Map<string, GrantStatus[]>();
    for (const grant of opCloudGrantStatuses(data)) {
        getOrInit(byVendor, grant.vendor, (): GrantStatus[] => []).push(grant);
    }
    for (const list of byVendor.values()) {
        list.sort(
            (a, b) =>
                a.startDate.localeCompare(b.startDate) ||
                a.label.localeCompare(b.label),
        );
    }

    const burnByVendorMonth = opCloudBurnByVendorMonth(data);

    const fillMonth = new Map<GrantStatus, string>();
    const unallocated = new Map<string, number>();
    for (const [vendor, grants] of byVendor) {
        const months = [
            ...(burnByVendorMonth.get(vendor) ?? new Map()).entries(),
        ].sort((a, b) => a[0].localeCompare(b[0]));
        const overflowByMonth: [string, number, number][] = [];
        for (const [month, burn] of months) {
            let left = burn.creditUsd;
            for (const grant of grants) {
                if (left <= 0) break;
                if (grant.startDate.slice(0, 7) > month) continue;
                if (grant.expires && grant.expires.slice(0, 7) < month) {
                    continue;
                }
                const capacity = grant.grantedUsd - grant.allocatedUsd;
                if (capacity <= 0) continue;
                const take = Math.min(capacity, left);
                grant.allocatedUsd += take;
                left -= take;
                if (grant.grantedUsd - grant.allocatedUsd <= POOL_EPS_USD) {
                    fillMonth.set(grant, month);
                }
            }
            if (left > 0) {
                // pass 1 consumed ordinary burn first, so the leftover is
                // plug-first up to the month's plug amount
                const plugLeft = Math.min(left, burn.plugUsd);
                overflowByMonth.push([month, left - plugLeft, plugLeft]);
            }
        }
        // Pass 2: leftover into non-expired grants that already existed at
        // burn time — burn cannot consume credit granted later. The one
        // exception is the explicit "pre-2026 grant burn" opening plug,
        // whose date predates grant metadata by construction; only its
        // amount may spill onto any non-expired grant.
        let overflow = 0;
        for (const [month, ordinaryLeft, plugLeft] of overflowByMonth) {
            for (const [amount, plug] of [
                [plugLeft, true],
                [ordinaryLeft, false],
            ] as const) {
                let left = amount;
                for (const grant of grants) {
                    if (left <= 0) break;
                    if (grant.expires && grant.expires < today) continue;
                    if (!plug && grant.startDate.slice(0, 7) > month) {
                        continue;
                    }
                    const capacity = grant.grantedUsd - grant.allocatedUsd;
                    if (capacity <= 0) continue;
                    const take = Math.min(capacity, left);
                    grant.allocatedUsd += take;
                    left -= take;
                    if (grant.grantedUsd - grant.allocatedUsd <= POOL_EPS_USD) {
                        const latest = months[months.length - 1];
                        if (latest && !fillMonth.has(grant)) {
                            fillMonth.set(grant, latest[0]);
                        }
                    }
                }
                overflow += left;
            }
        }
        if (overflow > POOL_EPS_USD) unallocated.set(vendor, overflow);

        for (const grant of grants) {
            const expired = grant.expires != null && grant.expires < today;
            const exhausted =
                grant.grantedUsd - grant.allocatedUsd <= POOL_EPS_USD;
            grant.lapsedUsd = expired
                ? Math.max(grant.grantedUsd - grant.allocatedUsd, 0)
                : 0;
            grant.active = !expired && !exhausted;
            grant.finishedDate = expired
                ? grant.expires
                : exhausted
                  ? (fillMonth.get(grant) ?? null)
                  : null;
        }
    }

    return { grants: [...byVendor.values()].flat(), unallocated };
}

// Where do credits stand NOW — the lens ignores the global period filter and
// reads pre-window burn rows every other lens excludes. Remaining counts only
// non-expired grant capacity (expired remainders lapse). Burn depletion starts
// from the last full-month close, deducts the running month's witnessed burn,
// then divides the live remainder by this month's daily burn intensity. When
// the running month is silent, the last complete month is the fallback signal.
// Vendors whose pools are done (remaining ≈ 0) carry finished=true and their
// finish date.
export function creditRunway(data: Data, now: Date): RunwayRow[] {
    const today = now.toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);
    const lastMonth = monthShift(currentMonth, -1);
    const { grants, unallocated } = allocateGrants(data, now);

    const byVendor = new Map<string, RunwayRow>();
    for (const grant of grants) {
        const row = getOrInit(byVendor, grant.vendor, () => ({
            vendor: grant.vendor,
            grantedUsd: 0,
            burnedUsd: 0,
            remainingUsd: 0,
            lapsedUsd: 0,
            unallocatedUsd: unallocated.get(grant.vendor) ?? 0,
            preWindowBurnUsd: 0,
            lastMonthBurnUsd: 0,
            currentMonthBurnUsd: 0,
            cashLastMonthUsd: 0,
            cashCurrentMonthUsd: 0,
            monthlyRateUsd: null,
            rateBasis: null,
            depletionDate: null,
            depletionReason: null,
            finished: false,
            finishedDate: null,
            flags: [],
            grants: [],
        }));
        row.grantedUsd += grant.grantedUsd;
        row.lapsedUsd += grant.lapsedUsd;
        if (!(grant.expires != null && grant.expires < today)) {
            row.remainingUsd += Math.max(
                grant.grantedUsd - grant.allocatedUsd,
                0,
            );
        }
        row.grants.push(grant);
    }

    const burnByVendorMonth = opCloudBurnByVendorMonth(data);
    for (const [vendor, months] of burnByVendorMonth) {
        const entry = byVendor.get(vendor);
        if (!entry) continue;
        for (const [month, burn] of months) {
            if (burn.creditUsd > 0) {
                entry.burnedUsd += burn.creditUsd;
                if (month < WINDOW_START) {
                    entry.preWindowBurnUsd += burn.creditUsd;
                }
                if (month === lastMonth) {
                    entry.lastMonthBurnUsd += burn.creditUsd;
                }
                if (month === currentMonth) {
                    entry.currentMonthBurnUsd += burn.creditUsd;
                }
            }
            if (burn.paidUsd > 0) {
                if (month === lastMonth) entry.cashLastMonthUsd += burn.paidUsd;
                if (month === currentMonth) {
                    entry.cashCurrentMonthUsd += burn.paidUsd;
                }
            }
        }
    }

    for (const row of byVendor.values()) {
        row.finished = row.remainingUsd <= POOL_EPS_USD;
        if (row.finished) {
            row.finishedDate =
                row.grants
                    .map((grant) => grant.finishedDate)
                    .filter((date): date is string => date != null)
                    .sort()
                    .pop() ?? null;
        }

        // Some vendors' burn is witnessed in monthly steps well after the
        // usage (aws: Automat-it deducts credits when it INVOICES, ~the 10th
        // of the next month) — a silent June/July does not mean the pool
        // stopped burning. Fall back to the latest witnessed month, marked
        // stale and flagged, rather than showing a dead pool.
        const latestBurnMonth = [
            ...(burnByVendorMonth.get(row.vendor) ?? new Map()).entries(),
        ]
            .filter((entry) => entry[1].creditUsd > 0)
            .sort((a, b) => b[0].localeCompare(a[0]))[0];
        if (row.currentMonthBurnUsd > 0) {
            const elapsedDays = Math.max(1, now.getUTCDate());
            row.monthlyRateUsd =
                (row.currentMonthBurnUsd / elapsedDays) * AVG_DAYS_PER_MONTH;
            row.rateBasis = "current";
        } else if (row.lastMonthBurnUsd > 0) {
            row.monthlyRateUsd = row.lastMonthBurnUsd;
            row.rateBasis = "last";
        } else if (!row.finished && latestBurnMonth) {
            row.monthlyRateUsd = latestBurnMonth[1].creditUsd;
            row.rateBasis = "stale";
            row.flags.push(
                `no burn data since ${monthLabel(latestBurnMonth[0])}`,
            );
        }

        if (!row.finished) {
            // Walk the remaining capacity in expiry order: burn drains the
            // earliest-expiring parcel first, and whatever is left of a
            // parcel at its expiry lapses. The pool runs out when burn
            // empties the last parcel or the last parcel lapses — an early
            // expiry alone does not end a pool that has later grants.
            const perDayUsd = row.monthlyRateUsd
                ? row.monthlyRateUsd / AVG_DAYS_PER_MONTH
                : null;
            const parcels = row.grants
                .filter(
                    (grant) =>
                        !(grant.expires != null && grant.expires < today),
                )
                .map((grant) => ({
                    expiresMs: grant.expires
                        ? Date.parse(grant.expires)
                        : Number.POSITIVE_INFINITY,
                    remainingUsd: Math.max(
                        grant.grantedUsd - grant.allocatedUsd,
                        0,
                    ),
                }))
                .filter((parcel) => parcel.remainingUsd > 0)
                .sort((a, b) => a.expiresMs - b.expiresMs);
            let atMs = now.getTime();
            let reason: RunwayRow["depletionReason"] = null;
            for (const parcel of parcels) {
                if (perDayUsd) {
                    const burnMs =
                        (parcel.remainingUsd / perDayUsd) * 86_400_000;
                    if (atMs + burnMs <= parcel.expiresMs) {
                        atMs += burnMs;
                        reason = "burn";
                        continue;
                    }
                }
                if (parcel.expiresMs === Number.POSITIVE_INFINITY) {
                    // no burn signal and no expiry — never runs out
                    reason = null;
                    break;
                }
                atMs = parcel.expiresMs;
                reason = "expiry";
            }
            if (reason) {
                row.depletionDate = new Date(atMs).toISOString().slice(0, 10);
                row.depletionReason = reason;
            }
        }

        if (row.grants.some((grant) => grant.startDate < "2026-01-01")) {
            row.flags.push("pre-window burn unwitnessed");
        }
        if (row.lapsedUsd > POOL_EPS_USD) {
            row.flags.push(`lapsed ${Math.round(row.lapsedUsd)}`);
        }
        if (row.unallocatedUsd > POOL_EPS_USD) {
            row.flags.push(
                `unallocated burn ${Math.round(row.unallocatedUsd)}`,
            );
        }
    }

    return [...byVendor.values()].sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? 1 : -1;
        if (a.finished) {
            return (b.finishedDate ?? "").localeCompare(a.finishedDate ?? "");
        }
        if (a.depletionDate == null && b.depletionDate == null) {
            return b.burnedUsd - a.burnedUsd;
        }
        if (a.depletionDate == null) return 1;
        if (b.depletionDate == null) return -1;
        return (
            a.depletionDate.localeCompare(b.depletionDate) ||
            a.remainingUsd - b.remainingUsd
        );
    });
}

// ----------------------------------------------------- provider balances

export type ProviderBalanceMonth = {
    month: string;
    cashOpeningUsd: number | null;
    cashAddedUsd: number | null;
    cashUsedUsd: number | null;
    cashClosingUsd: number | null;
    creditOpeningUsd: number | null;
    creditAddedUsd: number | null;
    creditUsedUsd: number | null;
    creditLapsedUsd: number | null;
    creditClosingUsd: number | null;
};

export type ProviderBalanceRow = {
    vendor: string;
    cashBalanceUsd: number | null;
    creditBalanceUsd: number | null;
    balanceAsOf: string | null;
    balanceStatus: "checked" | "partial" | "not_checked";
    checkedAccounts: number;
    expectedAccounts: number;
    balanceNote: string | null;
    creditDepletionDate: string | null;
    creditDepletionReason: "burn" | "expiry" | null;
    finished: boolean;
    history: ProviderBalanceMonth[];
};

type BalanceFlow = {
    addedUsd: number;
    usedUsd: number;
    lapsedUsd: number;
};

function balanceMonths(now: Date): string[] {
    const end = now.toISOString().slice(0, 7);
    const months: string[] = [];
    for (
        let month = WINDOW_START;
        month <= end && months.length < 120;
        month = monthShift(month, 1)
    ) {
        months.push(month);
    }
    return months;
}

function balanceFlow(
    flows: Map<string, Map<string, BalanceFlow>>,
    vendor: string,
    month: string,
): BalanceFlow {
    const months = getOrInit(flows, vendor, () => new Map());
    return getOrInit(months, month, () => ({
        addedUsd: 0,
        usedUsd: 0,
        lapsedUsd: 0,
    }));
}

type ProviderBalanceAnchor = {
    cashUsd: number;
    creditUsd: number;
    observedOn: string;
    creditExpiry: string | null;
    balanceNote: string | null;
};

type ProviderBalanceCoverage = Pick<
    ProviderBalanceRow,
    "balanceAsOf" | "balanceStatus" | "checkedAccounts" | "expectedAccounts"
>;

const MAX_BALANCE_SNAPSHOT_AGE_DAYS = 7;

function dateShift(date: string, days: number): string {
    const shifted = new Date(`${date}T00:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted.toISOString().slice(0, 10);
}

function providerBalanceAnchors(
    data: Data,
    currentMonth: string,
    today: string,
): {
    anchors: Map<string, ProviderBalanceAnchor>;
    coverage: Map<string, ProviderBalanceCoverage>;
} {
    const rowsByVendorAccount = new Map<string, Map<string, OpCloudRow>>();
    for (const row of data.opCloud ?? []) {
        if (!isOpCloudBalanceRow(row)) continue;
        const observedOn = row.start.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(observedOn) || observedOn > today) {
            continue;
        }
        const accounts = getOrInit(
            rowsByVendorAccount,
            row.vendor,
            () => new Map(),
        );
        const accountId = row.account_id?.trim() || "default";
        const existing = accounts.get(accountId);
        if (
            !existing ||
            `${row.start}|${row.recorded_at}` >
                `${existing.start}|${existing.recorded_at}`
        ) {
            accounts.set(accountId, row);
        }
    }

    const anchors = new Map<string, ProviderBalanceAnchor>();
    const coverage = new Map<string, ProviderBalanceCoverage>();
    const freshSince = dateShift(today, -MAX_BALANCE_SNAPSHOT_AGE_DAYS);
    for (const [vendor, accounts] of rowsByVendorAccount) {
        const provider = resolveProvider(vendor);
        const expectedAccounts = provider
            ? activeProviderAccounts(provider, currentMonth).map(
                  (account) => account.id,
              )
            : [];
        const selected = (
            expectedAccounts.length > 0
                ? expectedAccounts.map((accountId) => accounts.get(accountId))
                : [...accounts.values()]
        ).filter((row): row is OpCloudRow => row != null);
        const rows = selected.filter(
            (row) => row.start.slice(0, 10) >= freshSince,
        );
        const expectedCount =
            expectedAccounts.length > 0
                ? expectedAccounts.length
                : accounts.size;
        const observedDates = rows.map((row) => row.start.slice(0, 10)).sort();
        const checkedAccounts = rows.length;
        coverage.set(vendor, {
            balanceAsOf: observedDates[0] ?? null,
            balanceStatus:
                checkedAccounts === 0
                    ? "not_checked"
                    : checkedAccounts < expectedCount
                      ? "partial"
                      : "checked",
            checkedAccounts,
            expectedAccounts: expectedCount,
        });
        if (rows.length === 0) continue;
        const expiries = rows
            .filter((row) => Number(row.credit) > 0 && row.end)
            .map((row) => row.end.slice(0, 10))
            .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
            .sort();
        anchors.set(vendor, {
            cashUsd: rows.reduce(
                (sum, row) => sum + toUsd(row.paid, row.currency, row.start),
                0,
            ),
            creditUsd: rows.reduce(
                (sum, row) => sum + toUsd(row.credit, row.currency, row.start),
                0,
            ),
            observedOn: observedDates[0],
            creditExpiry: expiries.at(-1) ?? null,
            balanceNote:
                rows.find((row) => row.resource_sku === "usage-quota")
                    ?.resource_name || null,
        });
    }
    return { anchors, coverage };
}

function anchoredCreditDepletion(
    anchor: ProviderBalanceAnchor,
    credit: RunwayRow | null,
    now: Date,
): Pick<ProviderBalanceRow, "creditDepletionDate" | "creditDepletionReason"> {
    if (anchor.creditUsd <= POOL_EPS_USD) {
        return { creditDepletionDate: null, creditDepletionReason: null };
    }
    const candidates: {
        date: string;
        reason: "burn" | "expiry";
    }[] = [];
    if (credit?.monthlyRateUsd && credit.monthlyRateUsd > 0) {
        const days =
            (anchor.creditUsd / credit.monthlyRateUsd) * AVG_DAYS_PER_MONTH;
        candidates.push({
            date: new Date(now.getTime() + days * 86_400_000)
                .toISOString()
                .slice(0, 10),
            reason: "burn",
        });
    }
    if (anchor.creditExpiry) {
        candidates.push({ date: anchor.creditExpiry, reason: "expiry" });
    }
    candidates.sort((a, b) => a.date.localeCompare(b.date));
    const first = candidates[0];
    return {
        creditDepletionDate: first?.date ?? null,
        creditDepletionReason: first?.reason ?? null,
    };
}

// OP Cloud balance snapshots are the only current-balance truth. Ledger flows
// remain visible without a snapshot, but they never invent a current balance.
// A partial multi-account snapshot intentionally shows only the checked
// accounts; coverage tells the UI that the total is a known minimum rather than
// a complete provider balance.
export function providerBalanceRows(
    data: Data,
    now: Date,
): ProviderBalanceRow[] {
    const today = now.toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);
    const months = balanceMonths(now);
    const { anchors, coverage } = providerBalanceAnchors(
        data,
        currentMonth,
        today,
    );
    const creditRows = creditRunway(data, now);
    const creditByVendor = new Map(
        creditRows.map((row) => [row.vendor, row] as const),
    );
    const cashFlows = new Map<string, Map<string, BalanceFlow>>();
    const creditFlows = new Map<string, Map<string, BalanceFlow>>();
    const cashVendors = new Set<string>();

    const afterAnchor = (vendor: string, date: string) => {
        const observedOn = anchors.get(vendor)?.observedOn;
        return observedOn != null && date > observedOn;
    };

    for (const row of (data.opTransactions ?? []).filter(isBankMovement)) {
        if (!PREPAID_VENDORS.has(row.vendor)) continue;
        if (!isComputeOrInfrastructureCategory(transactionCategory(row))) {
            continue;
        }
        const month = row.date.slice(0, 7);
        if (!MONTH_KEY_RE.test(month) || month > currentMonth) continue;
        if (afterAnchor(row.vendor, row.date)) continue;
        const addedUsd = -opTransactionUsd(row);
        if (Math.abs(addedUsd) <= 0.005) continue;
        balanceFlow(cashFlows, row.vendor, month).addedUsd += addedUsd;
        cashVendors.add(row.vendor);
    }

    for (const row of data.opCloud ?? []) {
        if (isOpCloudBalanceRow(row)) continue;
        const month = opCloudMonth(row);
        if (!MONTH_KEY_RE.test(month) || month > currentMonth) continue;
        if (afterAnchor(row.vendor, row.start.slice(0, 10))) continue;
        const cashUsedUsd = opCloudPaidBurnUsd(row);
        if (PREPAID_VENDORS.has(row.vendor) && Math.abs(cashUsedUsd) > 0.005) {
            balanceFlow(cashFlows, row.vendor, month).usedUsd += cashUsedUsd;
            cashVendors.add(row.vendor);
        }
        const creditUsedUsd = opCloudCreditBurnUsd(row);
        if (creditUsedUsd > 0.005) {
            balanceFlow(creditFlows, row.vendor, month).usedUsd +=
                creditUsedUsd;
        }
    }

    for (const credit of creditRows) {
        for (const grant of credit.grants) {
            if (!afterAnchor(credit.vendor, grant.startDate)) {
                balanceFlow(
                    creditFlows,
                    credit.vendor,
                    grant.startDate.slice(0, 7),
                ).addedUsd += grant.grantedUsd;
            }
            if (
                grant.lapsedUsd > 0.005 &&
                grant.expires &&
                !afterAnchor(credit.vendor, grant.expires)
            ) {
                balanceFlow(
                    creditFlows,
                    credit.vendor,
                    grant.expires.slice(0, 7),
                ).lapsedUsd += grant.lapsedUsd;
            }
        }
    }

    const vendors = new Set([
        ...creditByVendor.keys(),
        ...cashVendors,
        ...anchors.keys(),
        ...coverage.keys(),
    ]);
    const rows: ProviderBalanceRow[] = [];
    for (const vendor of vendors) {
        const definition = resolveProvider(vendor);
        if (definition?.meteringBasis === "internal") continue;
        const credit = creditByVendor.get(vendor) ?? null;
        const anchor = anchors.get(vendor) ?? null;
        const balanceCoverage = coverage.get(vendor) ?? {
            balanceAsOf: null,
            balanceStatus: "not_checked" as const,
            checkedAccounts: 0,
            expectedAccounts:
                definition == null
                    ? 0
                    : activeProviderAccounts(definition, currentMonth).length,
        };
        const hasCashFlows = cashVendors.has(vendor) || anchor != null;
        const hasCreditFlows = credit != null || anchor != null;
        const history = months.map(
            (month): ProviderBalanceMonth => ({
                month,
                cashOpeningUsd: anchor ? 0 : null,
                cashAddedUsd: hasCashFlows
                    ? (cashFlows.get(vendor)?.get(month)?.addedUsd ?? 0)
                    : null,
                cashUsedUsd: hasCashFlows
                    ? (cashFlows.get(vendor)?.get(month)?.usedUsd ?? 0)
                    : null,
                cashClosingUsd: anchor ? 0 : null,
                creditOpeningUsd: anchor ? 0 : null,
                creditAddedUsd: hasCreditFlows
                    ? (creditFlows.get(vendor)?.get(month)?.addedUsd ?? 0)
                    : null,
                creditUsedUsd: hasCreditFlows
                    ? (creditFlows.get(vendor)?.get(month)?.usedUsd ?? 0)
                    : null,
                creditLapsedUsd: hasCreditFlows
                    ? (creditFlows.get(vendor)?.get(month)?.lapsedUsd ?? 0)
                    : null,
                creditClosingUsd: anchor ? 0 : null,
            }),
        );

        if (anchor) {
            let closing = anchor.cashUsd;
            for (let index = history.length - 1; index >= 0; index -= 1) {
                const month = history[index];
                month.cashClosingUsd = closing;
                closing =
                    closing -
                    (month.cashAddedUsd ?? 0) +
                    (month.cashUsedUsd ?? 0);
                month.cashOpeningUsd = closing;
            }
        }

        if (anchor) {
            let closing = anchor.creditUsd;
            for (let index = history.length - 1; index >= 0; index -= 1) {
                const month = history[index];
                month.creditClosingUsd = closing;
                closing =
                    closing -
                    (month.creditAddedUsd ?? 0) +
                    (month.creditUsedUsd ?? 0) +
                    (month.creditLapsedUsd ?? 0);
                month.creditOpeningUsd = closing;
            }
        }

        const cashBalanceUsd = anchor?.cashUsd ?? null;
        const creditBalanceUsd = anchor?.creditUsd ?? null;
        const anchoredDepletion =
            anchor && balanceCoverage.balanceStatus === "checked"
                ? anchoredCreditDepletion(anchor, credit, now)
                : null;
        rows.push({
            vendor,
            cashBalanceUsd,
            creditBalanceUsd,
            balanceAsOf: balanceCoverage.balanceAsOf,
            balanceStatus: balanceCoverage.balanceStatus,
            checkedAccounts: balanceCoverage.checkedAccounts,
            expectedAccounts: balanceCoverage.expectedAccounts,
            balanceNote: anchor?.balanceNote ?? null,
            creditDepletionDate:
                anchor && balanceCoverage.balanceStatus === "checked"
                    ? (anchoredDepletion?.creditDepletionDate ?? null)
                    : null,
            creditDepletionReason:
                anchor && balanceCoverage.balanceStatus === "checked"
                    ? (anchoredDepletion?.creditDepletionReason ?? null)
                    : null,
            finished:
                anchor != null &&
                Math.abs(cashBalanceUsd ?? 0) <= POOL_EPS_USD &&
                Math.abs(creditBalanceUsd ?? 0) <= POOL_EPS_USD,
            history,
        });
    }

    return rows.sort(
        (a, b) =>
            Number(a.finished) - Number(b.finished) ||
            (a.creditDepletionDate ?? "9999").localeCompare(
                b.creditDepletionDate ?? "9999",
            ) ||
            a.vendor.localeCompare(b.vendor),
    );
}

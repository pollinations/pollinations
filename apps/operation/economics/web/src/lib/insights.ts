import type { Data, OpCloudRow, OpTransactionRow } from "../types";
import { toUsd } from "./fx";
import {
    type MonthFilterValue,
    matchesMonth,
    monthLabel,
    WINDOW_START,
} from "./months";

// ---------------------------------------------------------- transactions

export const CATEGORY_ORDER = [
    "cloud",
    "saas",
    "office",
    "admin",
    "payroll",
] as const;

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

// Signed burn: a refund (positive `paid`) reduces the vendor bill instead of
// being dropped. Every lens — Providers, GPU, credits — must share these two
// helpers so refund months can never disagree across tabs.
export function opCloudPaidBurnUsd(
    row: Pick<OpCloudRow, "currency" | "paid" | "start">,
): number {
    return -toUsd(row.paid, row.currency, row.start);
}

export function opCloudCreditBurnUsd(
    row: Pick<OpCloudRow, "credit" | "currency" | "start">,
): number {
    return Math.max(0, -toUsd(row.credit, row.currency, row.start));
}

// Uncategorized spend stays visible as "other" — folding it into a named
// bucket would silently misstate that bucket.
function opSpendCategory(row: Pick<OpTransactionRow, "category">): string {
    return row.category || "other";
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
    for (const row of data.opTransactions ?? []) {
        months.add(row.date.slice(0, 7));
    }

    return [...months]
        .filter((month) => MONTH_KEY_RE.test(month) && month >= WINDOW_START)
        .sort()
        .map((month) => {
            const categories: Record<string, number> = {};
            let revenue = 0;
            let hasRevenue = false;
            for (const row of data.opTransactions ?? []) {
                if (row.date.slice(0, 7) !== month) continue;
                const amountUsd = opTransactionUsd(row);
                if (row.category === "revenue") {
                    revenue += amountUsd;
                    hasRevenue = true;
                    continue;
                }
                const key = opSpendCategory(row);
                categories[key] = (categories[key] ?? 0) - amountUsd;
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

const CATEGORY_LABELS: Record<string, string> = {
    cloud: "Cloud",
    saas: "SaaS",
    office: "Office",
    admin: "Admin",
    payroll: "Payroll",
};

function categoryLabel(category: string): string {
    return (
        CATEGORY_LABELS[category] ??
        category.charAt(0).toUpperCase() + category.slice(1)
    );
}

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
    for (const period of periods) {
        netMarginLine[period.key] = netMarginPct(
            cashPnlLine[period.key],
            revenueLine[period.key],
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
    for (const row of data.opTransactions ?? []) {
        if (row.category === "revenue") continue;
        const month = row.date.slice(0, 7);
        if (!monthSet.has(month)) continue;
        const category = opSpendCategory(row);
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
const PREPAID_VENDORS = new Set(["vast.ai", "deepinfra", "pruna", "fal"]);

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
    | "cash only"
    | "timing"
    | "missing cash"
    | "missing cloud"
    | "missing pollen"
    | "drift";

export type VendorPlanes = {
    month: string;
    vendor: string;
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
    pollenCostUsd,
}: {
    cashCoverage: CashCoverage;
    cashUsd: number | null;
    cloudCreditUsd: number | null;
    cloudPaidUsd: number | null;
    expectsCloudMeter: boolean;
    meterCloudUsd: number | null;
    pollenCostUsd: number | null;
}): MeterCoverage {
    const cashActive = activePositive(cashUsd, PROVIDER_PAID_FLOOR_USD);
    const cloudLedgerActive =
        activePositive(cloudPaidUsd, PROVIDER_PAID_FLOOR_USD) ||
        activePositive(cloudCreditUsd, PROVIDER_PAID_FLOOR_USD);
    const meterCloudActive = activePositive(meterCloudUsd, POLLEN_ACTIVE_USD);
    const pollenActive = activePositive(pollenCostUsd, POLLEN_ACTIVE_USD);

    if (meterCloudActive && pollenActive) return "complete";
    if (
        !meterCloudActive &&
        (pollenActive ||
            (expectsCloudMeter &&
                cashActive &&
                !cloudLedgerActive &&
                cashCoverage !== "prepaid"))
    )
        return "missing cloud";
    if (meterCloudActive && !pollenActive) return "missing pollen";
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
    pollenCostUsd,
}: {
    calibX: number | null;
    cashCoverage: CashCoverage;
    cashUsd: number | null;
    cloudCreditUsd: number | null;
    cloudPaidUsd: number | null;
    meterCloudUsd: number | null;
    meterCoverage: MeterCoverage;
    pollenCostUsd: number | null;
}): DataQualityStatus {
    if (cashCoverage === "missing cash") return "missing cash";
    if (meterCoverage === "missing cloud") return "missing cloud";
    if (meterCoverage === "missing pollen") return "missing pollen";
    if (hasCalibDrift({ calibX, meterCloudUsd, pollenCostUsd })) return "drift";
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
    for (const row of data.opTransactions ?? []) {
        if (row.category !== "cloud") continue;
        const month = row.date.slice(0, 7);
        if (!MONTH_KEY_RE.test(month)) continue;
        const key = `${month}|${row.vendor}`;
        cash.set(key, (cash.get(key) ?? 0) - opTransactionUsd(row));
        cumulativeKeys.add(key);
    }

    const cloud = new Map<string, OpCloudWitness>();
    for (const row of data.opCloud ?? []) {
        const month = opCloudMonth(row);
        if (!MONTH_KEY_RE.test(month)) continue;
        const key = `${month}|${row.vendor}`;
        if (row.type === "infra") {
            infraCloudKeys.add(key);
            continue;
        }
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
            pollenCostUsd,
        });
        const calibX = monthCalib(meterCloudUsd, pollenCostUsd);
        return {
            month,
            vendor,
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
            status: dataQualityStatus({
                calibX,
                cashCoverage,
                cashUsd,
                cloudCreditUsd,
                cloudPaidUsd,
                meterCloudUsd,
                meterCoverage,
                pollenCostUsd,
            }),
        };
    });
}

export function insightVendorOptions(data: Data): string[] {
    const vendors = new Set<string>();
    for (const row of data.opTransactions ?? []) {
        if (row.category === "cloud" && row.vendor.trim()) {
            vendors.add(row.vendor.trim());
        }
    }
    for (const row of data.opCloud ?? []) {
        if (row.vendor.trim()) vendors.add(row.vendor.trim());
    }
    for (const row of data.opPollen ?? []) {
        if (row.vendor.trim()) vendors.add(row.vendor.trim());
    }
    return ["all", ...[...vendors].sort((a, b) => a.localeCompare(b))];
}

// ------------------------------------------------------------- economics

// Vendors whose provider_monthly rows are our own pollen numbers booked back
// (community mirror + meter-less free partners) — their calib is 1.00 by
// construction, a definition rather than a measurement.
const POLLEN_PRICED_VENDORS = new Set([
    "airforce",
    "community",
    "inferenceport",
    "pointsflyer",
    "seraphyn",
]);

// |calib − 1| beyond this marks a registry mispricing worth fixing.
export const CALIB_DRIFT_ALARM = 0.25;
export const CALIB_DRIFT_ABS_ALARM_USD = 100;

export function hasCalibDrift({
    calibX,
    meterCloudUsd,
    pollenCostUsd,
}: Pick<VendorPlanes, "calibX" | "meterCloudUsd" | "pollenCostUsd">): boolean {
    if (calibX == null || meterCloudUsd == null || pollenCostUsd == null) {
        return false;
    }
    return (
        Math.abs(calibX - 1) > CALIB_DRIFT_ALARM &&
        Math.abs(meterCloudUsd - pollenCostUsd) > CALIB_DRIFT_ABS_ALARM_USD
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
// Month-level witness gaps surface on the Data Quality tab.
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
        if (row.type === "infra") continue;

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
        const pollenPriced = POLLEN_PRICED_VENDORS.has(vendor);
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
    const byVendor = new Map<
        string,
        Map<string, { creditUsd: number; paidUsd: number }>
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
            () => new Map<string, { creditUsd: number; paidUsd: number }>(),
        );
        const entry = getOrInit(months, month, () => ({
            creditUsd: 0,
            paidUsd: 0,
        }));
        entry.creditUsd += creditUsd;
        entry.paidUsd += paidUsd;
    }
    return byVendor;
}

// Allocate each vendor's monthly credit burn to its grants. Pass 1 respects
// each grant's active window (start month ≤ burn month ≤ expiry month),
// oldest grant first — so an expired grant only absorbs burn from its own
// lifetime and its unused remainder LAPSES. Pass 2 re-allocates any leftover
// to non-expired grants regardless of window (vendor-pooled burn can't be
// attributed per-grant more precisely than that); what still doesn't fit is
// real unallocated burn. Exhaustion (allocated ≈ granted) marks a grant
// inactive and records the month it filled.
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
        let overflow = 0;
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
            overflow += left;
        }
        // Pass 2: leftover into any non-expired grant with capacity.
        if (overflow > 0) {
            for (const grant of grants) {
                if (overflow <= 0) break;
                if (grant.expires && grant.expires < today) continue;
                const capacity = grant.grantedUsd - grant.allocatedUsd;
                if (capacity <= 0) continue;
                const take = Math.min(capacity, overflow);
                grant.allocatedUsd += take;
                overflow -= take;
                if (grant.grantedUsd - grant.allocatedUsd <= POOL_EPS_USD) {
                    const latest = months[months.length - 1];
                    if (latest && !fillMonth.has(grant)) {
                        fillMonth.set(grant, latest[0]);
                    }
                }
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
            let burnDate: string | null = null;
            if (row.monthlyRateUsd && row.remainingUsd > 0) {
                // remainingUsd is the last full-month close minus this
                // month's witnessed burn, so this projects from today.
                const days =
                    (row.remainingUsd / row.monthlyRateUsd) *
                    AVG_DAYS_PER_MONTH;
                burnDate = new Date(now.getTime() + days * 86_400_000)
                    .toISOString()
                    .slice(0, 10);
            }
            const upcomingExpiry =
                row.grants
                    .map((grant) => grant.expires)
                    .filter(
                        (expiry): expiry is string =>
                            expiry != null && expiry >= today,
                    )
                    .sort()[0] ?? null;
            if (burnDate && (!upcomingExpiry || burnDate <= upcomingExpiry)) {
                row.depletionDate = burnDate;
                row.depletionReason = "burn";
            } else if (upcomingExpiry) {
                row.depletionDate = upcomingExpiry;
                row.depletionReason = "expiry";
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

import type {
    Data,
    OpCloudRow,
    OpTransactionRow,
    PollenMonthlyRow,
    RevenueMonthlyRow,
    TransactionRow,
} from "../types";
import { toUsd } from "./fx";
import {
    type MonthFilterValue,
    matchesMonth,
    monthLabel,
    WINDOW_START,
} from "./months";

// ---------------------------------------------------------------- revenue

export type MonthlyRevenue = {
    month: string;
    grossUsd: number;
    netUsd: number;
    netRatio: number | null;
};

export function monthlyRevenue(rows: RevenueMonthlyRow[]): MonthlyRevenue[] {
    const byMonth = new Map<string, { gross: number; net: number }>();
    for (const row of rows) {
        const entry = byMonth.get(row.month) ?? { gross: 0, net: 0 };
        entry.gross += toUsd(row.gross_amount, row.currency, row.month);
        entry.net += toUsd(
            row.gross_amount - row.fees_amount - row.refunds_amount,
            row.currency,
            row.month,
        );
        byMonth.set(row.month, entry);
    }
    return [...byMonth.entries()]
        .map(([month, { gross, net }]) => ({
            month,
            grossUsd: gross,
            netUsd: net,
            netRatio: gross > 0 ? net / gross : null,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
}

export function globalNetRatio(rows: RevenueMonthlyRow[]): number | null {
    let gross = 0;
    let net = 0;
    for (const entry of monthlyRevenue(rows)) {
        gross += entry.grossUsd;
        net += entry.netUsd;
    }
    return gross > 0 ? net / gross : null;
}

export function breakEvenMultiplier(netRatio: number | null): number | null {
    return netRatio && netRatio > 0 ? 1 / netRatio : null;
}

// ---------------------------------------------------------- transactions

export const CATEGORY_ORDER = [
    "cloud",
    "saas",
    "office",
    "admin",
    "payroll",
] as const;

// Cash that left the bank for this row: the settled Wise leg.
export function transactionCashUsd(row: TransactionRow): number {
    return toUsd(row.charged_amount, row.charged_currency, row.date);
}

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

function opTransactionUsd(row: OpTransactionRow): number {
    return toUsd(row.amount, row.currency, row.date);
}

function opCloudMonth(row: Pick<OpCloudRow, "start">): string {
    return row.start.slice(0, 7);
}

function opCloudPaidBurnUsd(
    row: Pick<OpCloudRow, "currency" | "paid" | "start">,
): number {
    return -toUsd(row.paid, row.currency, row.start);
}

function opCloudCreditBurnUsd(
    row: Pick<OpCloudRow, "credit" | "currency" | "start">,
): number {
    return Math.max(0, -toUsd(row.credit, row.currency, row.start));
}

function opSpendCategory(row: Pick<OpTransactionRow, "category">): string {
    return row.category && row.category !== "other" ? row.category : "admin";
}

export type PnlMonth = {
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

export type MonthSpendRow = {
    category: string;
    vendor: string;
    cashUsd: number;
    pctOfSpend: number | null;
};

export type MonthDetail = {
    summary: PnlMonth | null;
    spend: MonthSpendRow[];
};

// Single-month drill-down: where the month's cash actually went, at the
// grain the monthly matrix cannot show (category × vendor).
export function monthSpendDetail(
    data: Data,
    month: string,
    now: Date,
): MonthDetail {
    const summary =
        pnlByMonth(data, now).find((row) => row.month === month) ?? null;

    const byKey = new Map<string, MonthSpendRow>();
    for (const row of data.opTransactions ?? []) {
        if (row.date.slice(0, 7) !== month) continue;
        if (row.category === "revenue") continue;
        const category = opSpendCategory(row);
        const key = `${category}|${row.vendor}`;
        const entry = byKey.get(key) ?? {
            category,
            vendor: row.vendor,
            cashUsd: 0,
            pctOfSpend: null,
        };
        entry.cashUsd -= opTransactionUsd(row);
        byKey.set(key, entry);
    }
    const total = [...byKey.values()].reduce((a, row) => a + row.cashUsd, 0);
    const spend = [...byKey.values()]
        .map((row) => ({
            ...row,
            pctOfSpend: total > 0 ? (row.cashUsd / total) * 100 : null,
        }))
        .sort(
            (a, b) =>
                b.cashUsd - a.cashUsd ||
                a.category.localeCompare(b.category) ||
                a.vendor.localeCompare(b.vendor),
        );

    return { summary, spend };
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
        let vendors = byCategory.get(category);
        if (!vendors) {
            vendors = new Map();
            byCategory.set(category, vendors);
        }
        let months = vendors.get(row.vendor);
        if (!months) {
            months = new Map();
            vendors.set(row.vendor, months);
        }
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
export const PREPAID_VENDORS = new Set([
    "vast.ai",
    "deepinfra",
    "pruna",
    "fal",
]);

// Pollen activity below this is noise, not a funding question.
const POLLEN_ACTIVE_USD = 1;

// Provider paid amounts at or below this never raise funding warnings.
const PROVIDER_PAID_FLOOR_USD = 1;

// Slack for prepaid cumulative matching (FX drift, fees, cents).
const PREPAID_EPS_USD = 50;

// Infra rows (Cloudflare, the EC2/CloudFront share of AWS) fund pools and
// cash flow, but they have no pollen plane — they stay out of the compute
// lenses (data quality, calibration).
export function isInfraRow(row: { category?: string }): boolean {
    return row.category === "infra";
}

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

export type CashCoverage =
    | "same month"
    | "cash ±1mo"
    | "prepaid"
    | "credit funded"
    | "missing cash"
    | null;

export type MeterCoverage =
    | "complete"
    | "missing cloud"
    | "missing pollen"
    | null;

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
        const entry = cloud.get(key) ?? {
            paidUsd: 0,
            creditUsd: 0,
            cloudUsd: 0,
            meterCloudUsd: 0,
        };
        entry.paidUsd += paidUsd;
        entry.creditUsd += creditUsd;
        entry.cloudUsd += cloudUsd;
        entry.meterCloudUsd += meterCloudUsd;
        cloud.set(key, entry);
        nonInfraCloudKeys.add(key);
        cumulativeKeys.add(key);
        if (month >= WINDOW_START) displayKeys.add(key);
    }

    const pollen = new Map<string, OpPollenWitness>();
    for (const row of data.opPollen ?? []) {
        if (!MONTH_KEY_RE.test(row.month) || row.month < WINDOW_START) continue;
        const key = `${row.month}|${row.vendor}`;
        const entry = pollen.get(key) ?? {
            paidCostUsd: 0,
            questCostUsd: 0,
            totalCostUsd: 0,
        };
        entry.paidCostUsd += toUsd(row.cost_paid, row.currency, row.month);
        entry.questCostUsd += toUsd(row.cost_quests, row.currency, row.month);
        entry.totalCostUsd += toUsd(
            row.cost_paid + row.cost_quests,
            row.currency,
            row.month,
        );
        pollen.set(key, entry);
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
        const months = monthsByVendor.get(vendor) ?? [];
        months.push(month);
        monthsByVendor.set(vendor, months);
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
export const POLLEN_PRICED_VENDORS = new Set([
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

export type EconGrain = "vendor" | "model";

export type EconRow = {
    vendor: string;
    model: string | null;
    soldPaidUsd: number;
    ecoPaidUsd: number;
    retainedPaidUsd: number;
    soldQuestsUsd: number;
    trueCostPaidUsd: number;
    questBurnUsd: number;
    calib: number | null;
    pollenPriced: boolean;
    creditSharePct: number | null;
    trueMultiplier: number | null;
    marginUsd: number;
    flags: string[];
};

export function grantFundedUsd(row: EconRow): number {
    if (row.trueCostPaidUsd <= 0) return 0;
    const share = Math.min(100, Math.max(0, row.creditSharePct ?? 0)) / 100;
    return row.trueCostPaidUsd * share;
}

export function providerUsageUsd(row: EconRow): number {
    return row.trueCostPaidUsd + row.questBurnUsd;
}

export function providerGrantFundedUsd(row: EconRow): number {
    const usage = providerUsageUsd(row);
    if (usage <= 0) return 0;
    const share = Math.min(100, Math.max(0, row.creditSharePct ?? 0)) / 100;
    return usage * share;
}

export function providerCashCostUsd(row: EconRow): number {
    return Math.max(0, providerUsageUsd(row) - providerGrantFundedUsd(row));
}

export function cashCostPaidUsd(row: EconRow): number {
    return Math.max(0, row.trueCostPaidUsd - grantFundedUsd(row));
}

export function cashMarginUsd(row: EconRow): number {
    return row.retainedPaidUsd - providerCashCostUsd(row);
}

export function marginPct(
    marginUsd: number,
    retainedPaidUsd: number,
): number | null {
    return retainedPaidUsd > 0 ? (marginUsd / retainedPaidUsd) * 100 : null;
}

export function cashMarginPct(row: EconRow): number | null {
    return marginPct(cashMarginUsd(row), row.retainedPaidUsd);
}

export function trueMarginPct(row: EconRow): number | null {
    return marginPct(row.marginUsd, row.retainedPaidUsd);
}

export function cashMultiplier(row: EconRow): number | null {
    const cost = providerCashCostUsd(row);
    return cost > 0 ? row.retainedPaidUsd / cost : null;
}

// One table, two grains: the Vendors summary is exactly the Models table
// rolled up (calib is per-vendor, so every dollar column is additive and
// true × is Σ/Σ). The math treats the raw data as perfect — calib is a plain
// Σ provider actual / Σ our metering over the scope, no pairing or smoothing —
// and every condition that could bend that number becomes a flag instead:
// "unwitnessed" months (pollen active, no provider row yet — calib reads low),
// "unmetered" months (provider billed, no pollen — calib reads high),
// "no meter" (no provider rows at all — true cost falls back to our metering).
export function economics(
    data: Data,
    monthFilter: MonthFilterValue,
    grain: EconGrain,
): EconRow[] {
    type VendorFacts = {
        meteredByMonth: Map<string, number>;
        actualUsd: number;
        creditUsd: number;
        providerMonths: Set<string>;
        hasProvider: boolean;
    };
    const vendors = new Map<string, VendorFacts>();
    const factsFor = (vendor: string): VendorFacts => {
        let facts = vendors.get(vendor);
        if (!facts) {
            facts = {
                meteredByMonth: new Map(),
                actualUsd: 0,
                creditUsd: 0,
                providerMonths: new Set(),
                hasProvider: false,
            };
            vendors.set(vendor, facts);
        }
        return facts;
    };

    for (const row of data.providerMonthly) {
        if (row.month < WINDOW_START) continue; // pre-window grant-burn rows
        if (isInfraRow(row)) continue; // calib compares compute against pollen
        if (!matchesMonth(row.month, monthFilter)) continue;
        const facts = factsFor(row.vendor);
        facts.hasProvider = true;
        facts.providerMonths.add(row.month);
        facts.actualUsd += toUsd(
            row.credit + row.paid,
            row.currency,
            row.month,
        );
        facts.creditUsd += toUsd(row.credit, row.currency, row.month);
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
    for (const row of data.pollenMonthly) {
        if (!matchesMonth(row.month, monthFilter)) continue;
        const facts = factsFor(row.vendor);
        facts.meteredByMonth.set(
            row.month,
            (facts.meteredByMonth.get(row.month) ?? 0) +
                toUsd(row.cost_paid + row.cost_quests, row.currency, row.month),
        );
        const key =
            grain === "model" ? `${row.vendor}|${row.model}` : row.vendor;
        const entry = byKey.get(key) ?? {
            vendor: row.vendor,
            model: grain === "model" ? row.model : null,
            soldPaid: 0,
            eco: 0,
            soldQuests: 0,
            meteredPaid: 0,
            meteredQuests: 0,
        };
        entry.soldPaid += toUsd(row.price_paid, row.currency, row.month);
        entry.eco += toUsd(
            row.byop_paid + row.model_paid,
            row.currency,
            row.month,
        );
        entry.soldQuests += toUsd(row.price_quests, row.currency, row.month);
        entry.meteredPaid += toUsd(row.cost_paid, row.currency, row.month);
        entry.meteredQuests += toUsd(row.cost_quests, row.currency, row.month);
        byKey.set(key, entry);
    }

    type VendorCalib = {
        calib: number | null;
        pollenPriced: boolean;
        creditSharePct: number | null;
        flags: string[];
    };
    const calibs = new Map<string, VendorCalib>();
    for (const [vendor, facts] of vendors) {
        if (facts.meteredByMonth.size === 0) continue; // not pollen-routed
        const metered = [...facts.meteredByMonth.values()].reduce(
            (a, b) => a + b,
            0,
        );
        const pollenPriced = POLLEN_PRICED_VENDORS.has(vendor);
        const flags: string[] = [];
        let calib: number | null = null;
        if (pollenPriced) {
            calib = 1;
        } else if (!facts.hasProvider) {
            flags.push("no meter");
        } else if (metered > 0) {
            calib = facts.actualUsd / metered;
            const unwitnessed = [...facts.meteredByMonth.entries()]
                .filter(
                    ([month, usd]) =>
                        usd > POLLEN_ACTIVE_USD &&
                        !facts.providerMonths.has(month),
                )
                .map(([month]) => month)
                .sort();
            if (unwitnessed.length) {
                flags.push(
                    `unwitnessed ${unwitnessed.map(monthLabel).join(", ")}`,
                );
            }
            const unmetered = [...facts.providerMonths]
                .filter((month) => !facts.meteredByMonth.has(month))
                .sort();
            if (unmetered.length) {
                flags.push(`unmetered ${unmetered.map(monthLabel).join(", ")}`);
            }
        }
        calibs.set(vendor, {
            calib,
            pollenPriced,
            creditSharePct:
                facts.hasProvider && facts.actualUsd > 0
                    ? (facts.creditUsd / facts.actualUsd) * 100
                    : null,
            flags,
        });
    }

    return [...byKey.values()]
        .map((entry) => {
            const vendorCalib = calibs.get(entry.vendor);
            const applied = vendorCalib?.calib ?? 1;
            const trueCostPaidUsd = entry.meteredPaid * applied;
            const questBurnUsd = entry.meteredQuests * applied;
            const providerUsage = trueCostPaidUsd + questBurnUsd;
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
                calib: vendorCalib?.calib ?? null,
                pollenPriced: vendorCalib?.pollenPriced ?? false,
                creditSharePct: vendorCalib?.creditSharePct ?? null,
                trueMultiplier:
                    providerUsage > 0 ? retainedPaidUsd / providerUsage : null,
                marginUsd: retainedPaidUsd - providerUsage,
                flags: vendorCalib?.flags ?? [],
            };
        })
        .sort((a, b) => {
            // Most underpriced first; ratio-less rows (quest-only) last,
            // ordered by what they burn.
            if (a.trueMultiplier == null && b.trueMultiplier == null) {
                return b.questBurnUsd - a.questBurnUsd;
            }
            if (a.trueMultiplier == null) return 1;
            if (b.trueMultiplier == null) return -1;
            return a.trueMultiplier - b.trueMultiplier;
        });
}

// Unit economics from OP sources only:
// - OP Cloud is the provider bill witness (paid + credit burn, excluding infra)
// - OP Pollen is the product meter and paid/quest revenue split
// The returned shape intentionally matches `economics(...)` so Providers and
// Models keep the same table math while their data source moves.
function opEconomics(
    data: Data,
    monthFilter: MonthFilterValue,
    grain: EconGrain,
): EconRow[] {
    type VendorFacts = {
        meteredByMonth: Map<string, number>;
        actualUsd: number;
        creditUsd: number;
        providerMonths: Set<string>;
        hasProvider: boolean;
    };
    const vendors = new Map<string, VendorFacts>();
    const factsFor = (vendor: string): VendorFacts => {
        let facts = vendors.get(vendor);
        if (!facts) {
            facts = {
                meteredByMonth: new Map(),
                actualUsd: 0,
                creditUsd: 0,
                providerMonths: new Set(),
                hasProvider: false,
            };
            vendors.set(vendor, facts);
        }
        return facts;
    };

    for (const row of data.opCloud ?? []) {
        const month = opCloudMonth(row);
        if (!MONTH_KEY_RE.test(month) || month < WINDOW_START) continue;
        if (!matchesMonth(month, monthFilter)) continue;
        if (row.type === "infra") continue;

        const paidUsd = opCloudPaidBurnUsd(row);
        const creditUsd = opCloudCreditBurnUsd(row);
        const actualUsd = paidUsd + creditUsd;
        if (Math.abs(actualUsd) <= 0.0001 && creditUsd <= 0.0001) continue;

        const facts = factsFor(row.vendor);
        facts.hasProvider = true;
        facts.providerMonths.add(month);
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
        const facts = factsFor(row.vendor);
        facts.meteredByMonth.set(
            row.month,
            (facts.meteredByMonth.get(row.month) ?? 0) +
                toUsd(row.cost_paid + row.cost_quests, row.currency, row.month),
        );
        const key =
            grain === "model" ? `${row.vendor}|${row.model}` : row.vendor;
        const entry = byKey.get(key) ?? {
            vendor: row.vendor,
            model: grain === "model" ? row.model : null,
            soldPaid: 0,
            eco: 0,
            soldQuests: 0,
            meteredPaid: 0,
            meteredQuests: 0,
        };
        entry.soldPaid += toUsd(row.price_paid, row.currency, row.month);
        entry.eco += toUsd(
            row.byop_paid + row.model_paid,
            row.currency,
            row.month,
        );
        entry.soldQuests += toUsd(row.price_quests, row.currency, row.month);
        entry.meteredPaid += toUsd(row.cost_paid, row.currency, row.month);
        entry.meteredQuests += toUsd(row.cost_quests, row.currency, row.month);
        byKey.set(key, entry);
    }

    type VendorCalib = {
        calib: number | null;
        pollenPriced: boolean;
        creditSharePct: number | null;
        flags: string[];
    };
    const calibs = new Map<string, VendorCalib>();
    for (const [vendor, facts] of vendors) {
        if (facts.meteredByMonth.size === 0) continue;
        const metered = [...facts.meteredByMonth.values()].reduce(
            (a, b) => a + b,
            0,
        );
        const pollenPriced = POLLEN_PRICED_VENDORS.has(vendor);
        const flags: string[] = [];
        let calib: number | null = null;
        if (pollenPriced) {
            calib = 1;
        } else if (!facts.hasProvider) {
            flags.push("no meter");
        } else if (metered > 0) {
            calib = facts.actualUsd / metered;
            const unwitnessed = [...facts.meteredByMonth.entries()]
                .filter(
                    ([month, usd]) =>
                        usd > POLLEN_ACTIVE_USD &&
                        !facts.providerMonths.has(month),
                )
                .map(([month]) => month)
                .sort();
            if (unwitnessed.length) {
                flags.push(
                    `unwitnessed ${unwitnessed.map(monthLabel).join(", ")}`,
                );
            }
            const unmetered = [...facts.providerMonths]
                .filter((month) => !facts.meteredByMonth.has(month))
                .sort();
            if (unmetered.length) {
                flags.push(`unmetered ${unmetered.map(monthLabel).join(", ")}`);
            }
        }
        calibs.set(vendor, {
            calib,
            pollenPriced,
            creditSharePct:
                facts.hasProvider && facts.actualUsd > 0
                    ? (facts.creditUsd / facts.actualUsd) * 100
                    : null,
            flags,
        });
    }

    return [...byKey.values()]
        .map((entry) => {
            const vendorCalib = calibs.get(entry.vendor);
            const applied = vendorCalib?.calib ?? 1;
            const trueCostPaidUsd = entry.meteredPaid * applied;
            const questBurnUsd = entry.meteredQuests * applied;
            const providerUsage = trueCostPaidUsd + questBurnUsd;
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
                calib: vendorCalib?.calib ?? null,
                pollenPriced: vendorCalib?.pollenPriced ?? false,
                creditSharePct: vendorCalib?.creditSharePct ?? null,
                trueMultiplier:
                    providerUsage > 0 ? retainedPaidUsd / providerUsage : null,
                marginUsd: retainedPaidUsd - providerUsage,
                flags: vendorCalib?.flags ?? [],
            };
        })
        .sort((a, b) => {
            if (a.trueMultiplier == null && b.trueMultiplier == null) {
                return b.questBurnUsd - a.questBurnUsd;
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

export type EconSummary = {
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
    mostUnderpriced: EconRow | null; // lowest true × in scope
};

// Roll a set of EconRows up to the headline numbers behind the stat cards.
// Blended true × is Σ/Σ, exactly how the table's own math composes, so the
// card can never disagree with the rows under it.
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
        mostUnderpriced: null,
    };
    let creditWeighted = 0;
    let creditWeight = 0;
    for (const row of rows) {
        acc.soldPaidUsd += row.soldPaidUsd;
        acc.soldQuestsUsd += row.soldQuestsUsd;
        acc.trueCostPaidUsd += row.trueCostPaidUsd;
        acc.cashCostPaidUsd += cashCostPaidUsd(row);
        acc.grantFundedUsd += grantFundedUsd(row);
        const rowProviderUsageUsd = providerUsageUsd(row);
        acc.providerUsageUsd += rowProviderUsageUsd;
        acc.providerCashCostUsd += providerCashCostUsd(row);
        acc.providerGrantFundedUsd += providerGrantFundedUsd(row);
        acc.retainedPaidUsd += row.retainedPaidUsd;
        acc.questBurnUsd += row.questBurnUsd;
        acc.marginUsd += row.marginUsd;
        const rowCashMarginUsd = cashMarginUsd(row);
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
            ? acc.retainedPaidUsd / acc.providerUsageUsd
            : null;
    acc.cashMultiplier =
        acc.cashCostPaidUsd > 0
            ? acc.retainedPaidUsd / acc.cashCostPaidUsd
            : null;
    acc.marginPct = marginPct(acc.marginUsd, acc.retainedPaidUsd);
    acc.cashMarginPct = marginPct(acc.cashMarginUsd, acc.retainedPaidUsd);
    acc.creditFundedPct =
        creditWeight > 0 ? creditWeighted / creditWeight : null;
    return acc;
}

// --------------------------------------------------------- credit runway

export type GrantStatus = {
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

export const PRE_WINDOW_GRANT_BURN_RESOURCE = "pre-2026 grant burn";

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
        const months = byVendor.get(row.vendor) ?? new Map();
        const entry = months.get(month) ?? { creditUsd: 0, paidUsd: 0 };
        entry.creditUsd += creditUsd;
        entry.paidUsd += paidUsd;
        months.set(month, entry);
        byVendor.set(row.vendor, months);
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
        const list = byVendor.get(grant.vendor) ?? [];
        list.push(grant);
        byVendor.set(grant.vendor, list);
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
        const row = byVendor.get(grant.vendor) ?? {
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
        };
        row.grantedUsd += grant.grantedUsd;
        row.lapsedUsd += grant.lapsedUsd;
        if (!(grant.expires != null && grant.expires < today)) {
            row.remainingUsd += Math.max(
                grant.grantedUsd - grant.allocatedUsd,
                0,
            );
        }
        row.grants.push(grant);
        byVendor.set(grant.vendor, row);
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

export type UngrantedBurnRow = {
    vendor: string;
    burnedUsd: number;
    lastMonthBurnUsd: number;
    currentMonthBurnUsd: number;
};

// Credit burn from vendors with NO grant row — either a missing grant fact
// (record it) or per-invoice discounts that never formed a pool (alibaba
// coupons). Pollen-priced free partners are excluded: their "credit" is our
// own bookkeeping, not a pool that can run dry.
export function ungrantedCreditBurn(data: Data, now: Date): UngrantedBurnRow[] {
    const currentMonth = now.toISOString().slice(0, 7);
    const lastMonth = monthShift(currentMonth, -1);
    const granted = new Set(
        opCloudGrantStatuses(data).map((grant) => grant.vendor),
    );

    const byVendor = new Map<string, UngrantedBurnRow>();
    for (const [vendor, months] of opCloudBurnByVendorMonth(data)) {
        if (granted.has(vendor)) continue;
        if (POLLEN_PRICED_VENDORS.has(vendor)) continue;
        const entry = byVendor.get(vendor) ?? {
            vendor,
            burnedUsd: 0,
            lastMonthBurnUsd: 0,
            currentMonthBurnUsd: 0,
        };
        for (const [month, burn] of months) {
            if (burn.creditUsd <= 0) continue;
            entry.burnedUsd += burn.creditUsd;
            if (month === lastMonth) entry.lastMonthBurnUsd += burn.creditUsd;
            if (month === currentMonth) {
                entry.currentMonthBurnUsd += burn.creditUsd;
            }
        }
        if (entry.burnedUsd > 0) byVendor.set(vendor, entry);
    }
    return [...byVendor.values()].sort((a, b) => b.burnedUsd - a.burnedUsd);
}

export type EcosystemTotals = { byopUsd: number; modelUsd: number };

// Product-adoption signal: everything credited onward to app developers
// (byop) and community model owners (model), paid + quests, in scope.
export function ecosystemTotals(
    rows: PollenMonthlyRow[],
    monthFilter: MonthFilterValue,
): EcosystemTotals {
    let byop = 0;
    let model = 0;
    for (const row of rows) {
        if (!matchesMonth(row.month, monthFilter)) continue;
        byop += toUsd(row.byop_paid + row.byop_quests, row.currency, row.month);
        model += toUsd(
            row.model_paid + row.model_quests,
            row.currency,
            row.month,
        );
    }
    return { byopUsd: byop, modelUsd: model };
}

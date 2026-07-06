import type { Data, RevenueMonthlyRow, TransactionRow } from "../types";
import { toUsd } from "./fx";

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
    "compute",
    "saas",
    "infra",
    "office",
    "admin",
    "payroll",
    "other",
] as const;

// Cash that left for this row: the bank leg when present, the invoice value
// as a fallback while the payment leg is still unmatched.
export function transactionCashUsd(row: TransactionRow): number {
    if (row.paid_amount > 0) {
        return toUsd(row.paid_amount, row.paid_currency, row.date);
    }
    if (row.charged_amount > 0) {
        return toUsd(row.charged_amount, row.charged_currency, row.date);
    }
    return 0;
}

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

// Enty batches arrive after a month closes and is filed, so the newest month
// holding rows is only trustworthy once a LATER batch exists. Months >= the
// returned value are incomplete; "0000-00" means nothing is trustworthy.
export function opexIncompleteFrom(
    transactions: TransactionRow[],
    now: Date,
): string {
    const months = transactions
        .map((row) => row.date.slice(0, 7))
        .filter((month) => MONTH_KEY_RE.test(month));
    const frontier =
        months.length > 0
            ? months.reduce((a, b) => (a > b ? a : b))
            : "0000-00";
    const current = now.toISOString().slice(0, 7);
    return frontier < current ? frontier : current;
}

export type PnlMonth = {
    month: string;
    revenueNetUsd: number | null;
    categories: Record<string, number>;
    spendUsd: number | null;
    cashPnlUsd: number | null;
    creditBurnUsd: number;
    opexIncomplete: boolean;
};

export function pnlByMonth(data: Data, now: Date): PnlMonth[] {
    const revenueByMonth = new Map(
        monthlyRevenue(data.revenueMonthly).map((entry) => [
            entry.month,
            entry,
        ]),
    );
    const incompleteFrom = opexIncompleteFrom(data.transactions, now);

    const months = new Set<string>();
    for (const row of data.transactions) months.add(row.date.slice(0, 7));
    for (const row of data.meterMonthly) months.add(row.month);
    for (const row of data.revenueMonthly) months.add(row.month);

    return [...months]
        .filter((month) => MONTH_KEY_RE.test(month))
        .sort()
        .map((month) => {
            const categories: Record<string, number> = {};
            for (const row of data.transactions) {
                if (row.date.slice(0, 7) !== month) continue;
                const key = row.category || "other";
                categories[key] =
                    (categories[key] ?? 0) + transactionCashUsd(row);
            }
            const hasTransactions = Object.keys(categories).length > 0;
            const spendUsd = hasTransactions
                ? Object.values(categories).reduce((a, b) => a + b, 0)
                : null;

            let creditBurnUsd = 0;
            for (const row of data.meterMonthly) {
                if (row.month === month) {
                    creditBurnUsd += toUsd(row.credit, row.currency, month);
                }
            }

            const revenueNetUsd = revenueByMonth.get(month)?.netUsd ?? null;
            return {
                month,
                revenueNetUsd,
                categories,
                spendUsd,
                cashPnlUsd:
                    revenueNetUsd != null && spendUsd != null
                        ? revenueNetUsd - spendUsd
                        : null,
                creditBurnUsd,
                opexIncomplete: month >= incompleteFrom,
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
    creditBurn: { vendor: string; creditUsd: number }[];
};

// Single-month drill-down: where the month's cash actually went, at the
// grain the monthly matrix cannot show (category × vendor), plus the
// credit-burn shadow per vendor.
export function monthSpendDetail(
    data: Data,
    month: string,
    now: Date,
): MonthDetail {
    const summary =
        pnlByMonth(data, now).find((row) => row.month === month) ?? null;

    const byKey = new Map<string, MonthSpendRow>();
    for (const row of data.transactions) {
        if (row.date.slice(0, 7) !== month) continue;
        const category = row.category || "other";
        const key = `${category}|${row.vendor}`;
        const entry = byKey.get(key) ?? {
            category,
            vendor: row.vendor,
            cashUsd: 0,
            pctOfSpend: null,
        };
        entry.cashUsd += transactionCashUsd(row);
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

    const creditByVendor = new Map<string, number>();
    for (const row of data.meterMonthly) {
        if (row.month !== month) continue;
        const credit = toUsd(row.credit, row.currency, month);
        if (credit <= 0) continue;
        creditByVendor.set(
            row.vendor,
            (creditByVendor.get(row.vendor) ?? 0) + credit,
        );
    }
    const creditBurn = [...creditByVendor.entries()]
        .map(([vendor, creditUsd]) => ({ vendor, creditUsd }))
        .sort((a, b) => b.creditUsd - a.creditUsd);

    return { summary, spend, creditBurn };
}

// ------------------------------------------------------ vendor three-way

export type VendorPlanes = {
    month: string;
    vendor: string;
    paidUsd: number | null;
    spentUsd: number | null;
    creditUsd: number | null;
    registeredUsd: number | null;
    spentVsRegisteredPct: number | null;
};

function pctDelta(a: number | null, b: number | null): number | null {
    if (a == null || b == null || b === 0) return null;
    return ((a - b) / b) * 100;
}

export function vendorPlanes(data: Data): VendorPlanes[] {
    const paid = new Map<string, number>();
    for (const row of data.transactions) {
        if (row.category !== "compute") continue;
        const key = `${row.date.slice(0, 7)}|${row.vendor}`;
        paid.set(key, (paid.get(key) ?? 0) + transactionCashUsd(row));
    }

    const spent = new Map<string, { total: number; credit: number }>();
    for (const row of data.meterMonthly) {
        const key = `${row.month}|${row.vendor}`;
        const entry = spent.get(key) ?? { total: 0, credit: 0 };
        entry.total += toUsd(row.credit + row.paid, row.currency, row.month);
        entry.credit += toUsd(row.credit, row.currency, row.month);
        spent.set(key, entry);
    }

    const registered = new Map<string, number>();
    for (const row of data.usageMonthly) {
        const key = `${row.month}|${row.vendor}`;
        registered.set(
            key,
            (registered.get(key) ?? 0) +
                toUsd(row.cost_paid + row.cost_quests, row.currency, row.month),
        );
    }

    const keys = new Set([
        ...paid.keys(),
        ...spent.keys(),
        ...registered.keys(),
    ]);
    return [...keys].sort().map((key) => {
        const [month, vendor] = key.split("|");
        const spentEntry = spent.get(key);
        const spentUsd = spentEntry ? spentEntry.total : null;
        const registeredUsd = registered.get(key) ?? null;
        return {
            month,
            vendor,
            paidUsd: paid.get(key) ?? null,
            spentUsd,
            creditUsd: spentEntry ? spentEntry.credit : null,
            registeredUsd,
            spentVsRegisteredPct: pctDelta(spentUsd, registeredUsd),
        };
    });
}

export function insightVendorOptions(data: Data): string[] {
    const vendors = new Set<string>();
    for (const row of data.transactions) {
        if (row.category === "compute" && row.vendor.trim()) {
            vendors.add(row.vendor.trim());
        }
    }
    for (const row of data.meterMonthly) {
        if (row.vendor.trim()) vendors.add(row.vendor.trim());
    }
    for (const row of data.usageMonthly) {
        if (row.vendor.trim()) vendors.add(row.vendor.trim());
    }
    return ["all", ...[...vendors].sort((a, b) => a.localeCompare(b))];
}

import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo } from "react";
import { DataTable, HeaderHint, TableScroller } from "../components/DataTable";
import { StatCards, type StatItem } from "../components/StatCards";
import { fmtPct, fmtUnsignedPct, fmtUsd } from "../lib/format";
import {
    categoryColumns,
    monthSpendDetail,
    type PnlMonth,
    pnlByMonth,
} from "../lib/insights";
import { matchesMonth, monthLabel } from "../lib/months";
import type { Data } from "../types";

const MONTH_ONLY_RE = /^\d{4}-\d{2}$/;

function pnlTone(value: number | null) {
    if (value == null) return "";
    return value >= 0 ? "text-intent-success-text" : "text-intent-danger-text";
}

function sum(values: (number | null)[]): number | null {
    const present = values.filter((value): value is number => value != null);
    if (present.length === 0) return null;
    return present.reduce((a, b) => a + b, 0);
}

export function totalsRow(rows: PnlMonth[], categories: string[]) {
    return {
        revenueNetUsd: sum(rows.map((row) => row.revenueNetUsd)),
        spendUsd: sum(rows.map((row) => row.spendUsd)),
        cashPnlUsd: sum(rows.map((row) => row.cashPnlUsd)),
        creditBurnUsd: rows.reduce((a, row) => a + row.creditBurnUsd, 0),
        categories: Object.fromEntries(
            categories.map((category) => [
                category,
                sum(rows.map((row) => row.categories[category] ?? null)),
            ]),
        ),
    };
}

// The four P&L headline cards, from either the multi-month totals or a single
// month's summary — both carry the same shape, so the cards read identically.
function pnlStatItems(source: {
    revenueNetUsd: number | null;
    spendUsd: number | null;
    cashPnlUsd: number | null;
    creditBurnUsd: number;
    categories: Record<string, number | null>;
}): StatItem[] {
    const topCategory = Object.entries(source.categories)
        .filter(
            (entry): entry is [string, number] =>
                entry[1] != null && entry[1] > 0,
        )
        .sort((a, b) => b[1] - a[1])[0];
    const netMargin =
        source.revenueNetUsd != null &&
        source.revenueNetUsd !== 0 &&
        source.cashPnlUsd != null
            ? (source.cashPnlUsd / source.revenueNetUsd) * 100
            : null;
    return [
        {
            label: "Revenue (net)",
            value: fmtUsd(source.revenueNetUsd),
            detail: "net of fees & refunds",
        },
        {
            label: "Spend",
            value: fmtUsd(source.spendUsd),
            detail: topCategory
                ? `${topCategory[0]} ${fmtUsd(topCategory[1])} top`
                : "no cash out",
        },
        {
            label: "Cash P&L",
            value: fmtUsd(source.cashPnlUsd),
            tone:
                source.cashPnlUsd == null
                    ? "base"
                    : source.cashPnlUsd >= 0
                      ? "pos"
                      : "neg",
            detail: netMargin != null ? `${fmtPct(netMargin)} net margin` : "—",
        },
        {
            label: "Credit burn",
            value:
                source.creditBurnUsd > 0 ? fmtUsd(source.creditBurnUsd) : "–",
            detail: "non-cash, grant-funded",
        },
    ];
}

// The matrix IS the yearly reading; one selected month flips to the
// drill-down grain the matrix cannot show (category × vendor). Dispatch
// before any hooks so the hook order stays stable across mode switches.
export function PnlTab({ data, month = "" }: { data: Data; month?: string }) {
    if (MONTH_ONLY_RE.test(month)) {
        return <PnlMonthDetail data={data} month={month} />;
    }
    return <PnlMatrix data={data} month={month} />;
}

function PnlMatrix({ data, month = "" }: { data: Data; month?: string }) {
    const allRows = useMemo(() => pnlByMonth(data, new Date()), [data]);
    const rows = useMemo(
        () =>
            allRows
                .filter((row) => matchesMonth(row.month, month))
                .sort((a, b) => b.month.localeCompare(a.month)),
        [allRows, month],
    );
    const categories = useMemo(() => categoryColumns(rows), [rows]);
    const totals = useMemo(
        () => totalsRow(rows, categories),
        [rows, categories],
    );

    return (
        <div className="flex flex-col gap-4">
            <StatCards items={pnlStatItems(totals)} />
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>month</TableHeaderCell>
                            <TableHeaderCell>
                                <HeaderHint hint="Stripe net: gross − fees − refunds, EUR→USD at monthly ECB rates.">
                                    revenue
                                </HeaderHint>
                            </TableHeaderCell>
                            {categories.map((category) => (
                                <TableHeaderCell key={category}>
                                    {category.toLowerCase()}
                                </TableHeaderCell>
                            ))}
                            <TableHeaderCell>
                                <HeaderHint hint="Sum of all category columns: total cash out for the month, by transaction date.">
                                    spend
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell>
                                <HeaderHint hint="revenue − spend. Only shown when both sides exist.">
                                    cash p&l
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell>
                                <HeaderHint hint="Provider-metered consumption covered by granted credits. No cash left the bank, so it is NOT in cash P&L.">
                                    credit burn
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.month}>
                                <TableCell>
                                    <span className="inline-flex items-center gap-1.5">
                                        {monthLabel(row.month)}
                                        {row.monthInProgress && (
                                            <span
                                                title="month in progress - cash is still landing"
                                                className="text-intent-danger-text"
                                            >
                                                ⚠
                                            </span>
                                        )}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    {fmtUsd(row.revenueNetUsd)}
                                </TableCell>
                                {categories.map((category) => (
                                    <TableCell key={category}>
                                        {fmtUsd(
                                            row.categories[category] ?? null,
                                        )}
                                    </TableCell>
                                ))}
                                <TableCell>{fmtUsd(row.spendUsd)}</TableCell>
                                <TableCell className={pnlTone(row.cashPnlUsd)}>
                                    {fmtUsd(row.cashPnlUsd)}
                                </TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {row.creditBurnUsd > 0
                                        ? `(${fmtUsd(row.creditBurnUsd)})`
                                        : "–"}
                                </TableCell>
                            </TableRow>
                        ))}
                        {rows.length > 1 && (
                            <TableRow>
                                <TableCell className="font-semibold">
                                    total
                                </TableCell>
                                <TableCell className="font-semibold">
                                    {fmtUsd(totals.revenueNetUsd)}
                                </TableCell>
                                {categories.map((category) => (
                                    <TableCell
                                        key={category}
                                        className="font-semibold"
                                    >
                                        {fmtUsd(totals.categories[category])}
                                    </TableCell>
                                ))}
                                <TableCell className="font-semibold">
                                    {fmtUsd(totals.spendUsd)}
                                </TableCell>
                                <TableCell
                                    className={`font-semibold ${pnlTone(totals.cashPnlUsd)}`}
                                >
                                    {fmtUsd(totals.cashPnlUsd)}
                                </TableCell>
                                <TableCell className="font-semibold text-theme-text-soft">
                                    {totals.creditBurnUsd > 0
                                        ? `(${fmtUsd(totals.creditBurnUsd)})`
                                        : "–"}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

function PnlMonthDetail({ data, month }: { data: Data; month: string }) {
    const detail = useMemo(
        () => monthSpendDetail(data, month, new Date()),
        [data, month],
    );
    const summary = detail.summary;
    const source = summary ?? {
        revenueNetUsd: null,
        spendUsd: null,
        cashPnlUsd: null,
        creditBurnUsd: 0,
        categories: {},
    };

    return (
        <div className="flex flex-col gap-4">
            {summary?.monthInProgress && (
                <span className="text-sm text-intent-danger-text">
                    ⚠ {monthLabel(month)} in progress — cash is still landing
                </span>
            )}
            <StatCards items={pnlStatItems(source)} />
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>category</TableHeaderCell>
                            <TableHeaderCell>vendor</TableHeaderCell>
                            <TableHeaderCell>
                                <HeaderHint hint="Cash out for this category × vendor: the settled Wise bank amount.">
                                    cash
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell>% of spend</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {detail.spend.map((row) => (
                            <TableRow key={`${row.category}|${row.vendor}`}>
                                <TableCell>{row.category}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{fmtUsd(row.cashUsd)}</TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {row.pctOfSpend == null
                                        ? "–"
                                        : fmtUnsignedPct(row.pctOfSpend)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
            {detail.creditBurn.length > 0 && (
                <TableScroller>
                    <DataTable>
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>vendor</TableHeaderCell>
                                <TableHeaderCell>credit</TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {detail.creditBurn.map((row) => (
                                <TableRow key={row.vendor}>
                                    <TableCell>{row.vendor}</TableCell>
                                    <TableCell className="text-theme-text-soft">
                                        ({fmtUsd(row.creditUsd)})
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </DataTable>
                </TableScroller>
            )}
        </div>
    );
}

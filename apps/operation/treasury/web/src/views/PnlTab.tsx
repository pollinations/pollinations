import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useMemo } from "react";
import { DataTable, HeaderHint, TableScroller } from "../components/DataTable";
import { fmtUsd } from "../lib/format";
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
        <div className="flex flex-col gap-3">
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
                                    {category}
                                </TableHeaderCell>
                            ))}
                            <TableHeaderCell>
                                <HeaderHint hint="Sum of all category columns: total cash out for the month, by invoice date.">
                                    spend
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell>
                                <HeaderHint hint="revenue − spend. Only shown when both sides exist.">
                                    cash P&L
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
                                        {row.opexIncomplete && (
                                            <span
                                                title="opex incomplete - the Enty batch for this month has not landed yet"
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
            <Text size="micro" tone="soft">
                costs are cash-basis by transaction date · EUR→USD at monthly
                ECB averages · (credit burn) = provider-metered spend covered by
                credits, not part of cash P&L · ⚠ = Enty batch not landed
            </Text>
        </div>
    );
}

function PnlMonthDetail({ data, month }: { data: Data; month: string }) {
    const detail = useMemo(
        () => monthSpendDetail(data, month, new Date()),
        [data, month],
    );
    const summary = detail.summary;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    {monthLabel(month)}
                    {summary?.opexIncomplete ? " ⚠" : ""}
                </Chip>
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    revenue {fmtUsd(summary?.revenueNetUsd ?? null)}
                </Chip>
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    spend {fmtUsd(summary?.spendUsd ?? null)}
                </Chip>
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    cash P&L {fmtUsd(summary?.cashPnlUsd ?? null)}
                </Chip>
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    credit burn{" "}
                    {summary && summary.creditBurnUsd > 0
                        ? `(${fmtUsd(summary.creditBurnUsd)})`
                        : "–"}
                </Chip>
            </div>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>category</TableHeaderCell>
                            <TableHeaderCell>vendor</TableHeaderCell>
                            <TableHeaderCell>
                                <HeaderHint hint="Cash out for this category × vendor: bank amount when matched, invoice amount as fallback.">
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
                                        : `${row.pctOfSpend.toFixed(1)}%`}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
            {detail.creditBurn.length > 0 && (
                <>
                    <Text size="micro" tone="soft">
                        credit burn (not cash)
                    </Text>
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
                </>
            )}
            <Text size="micro" tone="soft">
                single-month drill-down: cash by category and vendor · pick the
                year pill for the monthly matrix · ⚠ = Enty batch not landed
            </Text>
        </div>
    );
}

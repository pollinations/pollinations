import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo, useState } from "react";
import {
    type ColumnHint,
    DataTable,
    HeaderHint,
    TableScroller,
} from "../components/DataTable";
import { StatCards, type StatItem } from "../components/StatCards";
import { fmtPct, fmtUnsignedPct, fmtUsd } from "../lib/format";
import {
    type PnlLine,
    type PnlPeriod,
    type PnlVendorLine,
    pnlStatement,
} from "../lib/insights";
import type { MonthFilterValue } from "../lib/months";
import { signedTone } from "../lib/tone";
import type { Data } from "../types";

export function pnlTone(value: number | null) {
    if (value == null) return "";
    return signedTone(value);
}

export function expenseDeltaTone(value: number | null) {
    if (value == null) return "";
    return signedTone(-value);
}

export function pctChange(
    current: number | null,
    prior: number | null,
): number | null {
    if (current == null || prior == null || prior === 0) return null;
    return ((current - prior) / Math.abs(prior)) * 100;
}

function fmtSignedUsd(value: number | null): string {
    if (value == null) return "–";
    const formatted = fmtUsd(value);
    return value > 0 ? `+${formatted}` : formatted;
}

function fmtPoints(value: number | null): string {
    return fmtPct(value).replace(/%$/, "pp");
}

export function monthlyExpenseLines(lines: PnlLine[], primary: string) {
    return lines.filter(
        (line) =>
            line.kind === "category" &&
            line.values[primary] != null &&
            line.values[primary] !== 0,
    );
}

// One statement, one source of truth for the cards: the primary period's line
// values. Same shape the cards always consumed, now read off the P&L lines so
// the headline can never disagree with the table under it.
export function statSourceFromLines(lines: PnlLine[], primary: string) {
    const byKey = new Map(lines.map((line) => [line.key, line]));
    const value = (key: string): number | null =>
        byKey.get(key)?.values[primary] ?? null;
    const categories: Record<string, number | null> = {};
    for (const line of lines) {
        if (line.kind === "category") {
            categories[line.key] = line.values[primary] ?? null;
        }
    }
    return {
        revenueNetUsd: value("revenue"),
        spendUsd: value("total-spend"),
        cashPnlUsd: value("cash-pnl"),
        categories,
    };
}

// The P&L headline cards, from the primary period's aggregate.
function pnlStatItems(source: {
    revenueNetUsd: number | null;
    spendUsd: number | null;
    cashPnlUsd: number | null;
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
    ];
}

// The displayed text for one line×period cell. net-margin values are already
// percentages; everything else is money. Kept pure so the tests can assert
// formatting without a DOM.
export function pnlCellText(line: PnlLine, period: PnlPeriod): string {
    const value = line.values[period.key] ?? null;
    if (line.kind === "net-margin") {
        return period.kind === "delta" ? fmtPoints(value) : fmtPct(value);
    }
    // Delta columns are signed USD swings; a percentage-shaped line still reads
    // as a delta of its own unit — but only net-margin diverges, and it is
    // handled above, so the delta of a money line is money.
    return fmtUsd(value);
}

// Cell tone: cash-pnl and net-margin follow their sign; delta columns of money
// lines follow the swing's sign; the rest are neutral.
export function pnlCellClass(line: PnlLine, period: PnlPeriod): string {
    const value = line.values[period.key] ?? null;
    if (line.kind === "cash-pnl" || line.kind === "net-margin") {
        return pnlTone(value);
    }
    if (period.kind === "delta") {
        return line.kind === "category" || line.kind === "total-spend"
            ? expenseDeltaTone(value)
            : pnlTone(value);
    }
    return "";
}

const HINTS: Record<string, ColumnHint> = {
    revenue: {
        meaning:
            "Revenue cash movements in the signed Wise ledger, converted to USD by transaction date.",
        tables: "op_transactions_api",
        sources: "WISE",
        formula: "Σ amount where category = revenue",
    },
    "total-spend": {
        meaning:
            "Total cash out for the period, summed across every category row, by transaction date.",
        tables: "op_transactions_api",
        sources: "WISE",
        formula: "-Σ amount where category != revenue",
    },
    "cash-pnl": {
        meaning: "Revenue minus spend. Only shown when both sides exist.",
        formula: "revenue − spend",
    },
};

const SEPARATOR_BEFORE = new Set(["total-spend"]);

export function PnlTab({
    data,
    month = "",
}: {
    data: Data;
    month?: MonthFilterValue;
}) {
    const { periods, lines, primary } = useMemo(
        () => pnlStatement(data, month, new Date()),
        [data, month],
    );
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

    const statSource = useMemo(
        () => statSourceFromLines(lines, primary),
        [lines, primary],
    );
    const primaryPeriod = periods.find((period) => period.key === primary);
    const priorPeriod = periods.find(
        (period) => period.kind === "month" && period.key !== primary,
    );
    const isMonthView = periods.some((period) => period.kind === "delta");
    const columnCount = 2 + periods.length;

    const toggle = (key: string) =>
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    return (
        <div className="flex flex-col gap-4">
            {primaryPeriod?.inProgress && (
                <span className="text-sm text-intent-danger-text">
                    ⚠ {primaryPeriod.label} in progress — cash is still landing
                </span>
            )}
            <StatCards
                items={
                    isMonthView && priorPeriod
                        ? monthlyPnlStatItems(
                              lines,
                              primary,
                              priorPeriod.key,
                              priorPeriod.label,
                          )
                        : pnlStatItems(statSource)
                }
            />
            {isMonthView && priorPeriod ? (
                <MonthlyExpenseTable
                    lines={lines}
                    primary={primary}
                    primaryLabel={primaryPeriod?.label ?? primary}
                    prior={priorPeriod.key}
                    priorLabel={priorPeriod.label}
                    expanded={expanded}
                    onToggle={toggle}
                />
            ) : (
                <ClassicPnlTable
                    lines={lines}
                    periods={periods}
                    expanded={expanded}
                    onToggle={toggle}
                    columnCount={columnCount}
                />
            )}
        </div>
    );
}

function monthlyPnlStatItems(
    lines: PnlLine[],
    primary: string,
    prior: string,
    priorLabel: string,
): StatItem[] {
    const byKey = new Map(lines.map((line) => [line.key, line]));
    const value = (key: string, period: string): number | null =>
        byKey.get(key)?.values[period] ?? null;
    const revenue = value("revenue", primary);
    const spend = value("total-spend", primary);
    const result = value("cash-pnl", primary);
    const revenueDelta = value("revenue", "delta");
    const spendDelta = value("total-spend", "delta");
    const resultDelta = value("cash-pnl", "delta");
    const margin = value("net-margin", primary);
    const marginDelta = value("net-margin", "delta");

    const comparison = (
        delta: number | null,
        change: number | null,
        tone: string,
    ) => (
        <>
            <span className={tone}>
                {fmtSignedUsd(delta)}
                {change == null ? "" : ` · ${fmtPct(change)}`}
            </span>{" "}
            vs {priorLabel}
        </>
    );

    return [
        {
            label: "Revenue",
            value: fmtUsd(revenue),
            detail: comparison(
                revenueDelta,
                pctChange(revenue, value("revenue", prior)),
                pnlTone(revenueDelta),
            ),
        },
        {
            label: "Expenses",
            value: fmtUsd(spend),
            detail: comparison(
                spendDelta,
                pctChange(spend, value("total-spend", prior)),
                expenseDeltaTone(spendDelta),
            ),
        },
        {
            label: "Net result",
            value: fmtUsd(result),
            tone: result == null ? "base" : result >= 0 ? "pos" : "neg",
            detail: (
                <>
                    <span className={pnlTone(resultDelta)}>
                        {fmtSignedUsd(resultDelta)}
                    </span>
                    {margin == null ? "" : ` · ${fmtPct(margin)} margin`}
                    {marginDelta == null ? "" : " · "}
                    {marginDelta != null && (
                        <span className={pnlTone(marginDelta)}>
                            {fmtPoints(marginDelta)}
                        </span>
                    )}{" "}
                    vs {priorLabel}
                </>
            ),
        },
    ];
}

function MonthlyExpenseTable({
    lines,
    primary,
    primaryLabel,
    prior,
    priorLabel,
    expanded,
    onToggle,
}: {
    lines: PnlLine[];
    primary: string;
    primaryLabel: string;
    prior: string;
    priorLabel: string;
    expanded: Set<string>;
    onToggle: (key: string) => void;
}) {
    const expenses = monthlyExpenseLines(lines, primary);
    const total = lines.find((line) => line.kind === "total-spend");

    return (
        <div className="flex flex-col gap-2">
            <div>
                <h2 className="text-sm font-semibold text-theme-text">
                    Expense breakdown
                </h2>
                <p className="text-xs text-theme-text-soft">
                    {primaryLabel} cash expenses, compared with {priorLabel}
                </p>
            </div>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>Category</TableHeaderCell>
                            <TableHeaderCell align="right">
                                {primaryLabel}
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                % of revenue
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                vs {priorLabel}
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {expenses.map((line) => (
                            <MonthlyExpenseRows
                                key={line.key}
                                line={line}
                                primary={primary}
                                prior={prior}
                                isOpen={expanded.has(line.key)}
                                onToggle={() => onToggle(line.key)}
                            />
                        ))}
                        {total && (
                            <MonthlyExpenseSummary
                                line={total}
                                primary={primary}
                                prior={prior}
                            />
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

function MonthlyExpenseRows({
    line,
    primary,
    prior,
    isOpen,
    onToggle,
}: {
    line: PnlLine;
    primary: string;
    prior: string;
    isOpen: boolean;
    onToggle: () => void;
}) {
    const vendors = (line.vendors ?? []).filter(
        (vendor) =>
            vendor.values[primary] != null && vendor.values[primary] !== 0,
    );
    const delta = line.values.delta ?? null;
    const change = pctChange(
        line.values[primary] ?? null,
        line.values[prior] ?? null,
    );

    return (
        <>
            <TableRow>
                <TableCell>
                    {vendors.length > 0 ? (
                        <button
                            type="button"
                            onClick={onToggle}
                            className="inline-flex items-center gap-1.5 text-left hover:text-theme-text"
                        >
                            <span className="text-theme-text-soft">
                                {isOpen ? "▾" : "▸"}
                            </span>
                            {line.label}
                        </button>
                    ) : (
                        line.label
                    )}
                </TableCell>
                <TableCell align="right" numeric>
                    {fmtUsd(line.values[primary] ?? null)}
                </TableCell>
                <TableCell align="right" numeric>
                    {fmtUnsignedPct(line.pctOfRevenue)}
                </TableCell>
                <TableCell
                    align="right"
                    numeric
                    className={expenseDeltaTone(delta)}
                >
                    {fmtSignedUsd(delta)}
                    {change == null ? "" : ` · ${fmtPct(change)}`}
                </TableCell>
            </TableRow>
            {isOpen &&
                vendors.map((vendor) => {
                    const vendorDelta = vendor.values.delta ?? null;
                    const vendorChange = pctChange(
                        vendor.values[primary] ?? null,
                        vendor.values[prior] ?? null,
                    );
                    return (
                        <TableRow key={`${line.key}|${vendor.vendor}`}>
                            <TableCell className="pl-8 text-theme-text-soft">
                                {vendor.vendor}
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className="text-theme-text-soft"
                            >
                                {fmtUsd(vendor.values[primary] ?? null)}
                            </TableCell>
                            <TableCell />
                            <TableCell
                                align="right"
                                numeric
                                className={expenseDeltaTone(vendorDelta)}
                            >
                                {fmtSignedUsd(vendorDelta)}
                                {vendorChange == null
                                    ? ""
                                    : ` · ${fmtPct(vendorChange)}`}
                            </TableCell>
                        </TableRow>
                    );
                })}
        </>
    );
}

function MonthlyExpenseSummary({
    line,
    primary,
    prior,
}: {
    line: PnlLine;
    primary: string;
    prior: string;
}) {
    const delta = line.values.delta ?? null;
    const change = pctChange(
        line.values[primary] ?? null,
        line.values[prior] ?? null,
    );
    return (
        <TableRow className="border-t border-theme-border font-semibold">
            <TableCell>Total expenses</TableCell>
            <TableCell align="right" numeric>
                {fmtUsd(line.values[primary] ?? null)}
            </TableCell>
            <TableCell align="right" numeric>
                {fmtUnsignedPct(line.pctOfRevenue)}
            </TableCell>
            <TableCell
                align="right"
                numeric
                className={expenseDeltaTone(delta)}
            >
                {fmtSignedUsd(delta)}
                {change == null ? "" : ` · ${fmtPct(change)}`}
            </TableCell>
        </TableRow>
    );
}

function ClassicPnlTable({
    lines,
    periods,
    expanded,
    onToggle,
    columnCount,
}: {
    lines: PnlLine[];
    periods: PnlPeriod[];
    expanded: Set<string>;
    onToggle: (key: string) => void;
    columnCount: number;
}) {
    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell>line item</TableHeaderCell>
                        {periods.map((period) => (
                            <TableHeaderCell key={period.key}>
                                <span className="inline-flex items-center gap-1.5">
                                    {period.label}
                                    {period.inProgress && (
                                        <span
                                            title="month in progress - cash is still landing"
                                            className="text-intent-danger-text"
                                        >
                                            ⚠
                                        </span>
                                    )}
                                </span>
                            </TableHeaderCell>
                        ))}
                        <TableHeaderCell>% of Rev</TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {lines.map((line) => {
                        const hint = HINTS[line.key];
                        const isCategory = line.kind === "category";
                        const isOpen = expanded.has(line.key);
                        const emphasis =
                            line.kind === "revenue" ||
                            line.kind === "total-spend" ||
                            line.kind === "cash-pnl"
                                ? "font-semibold"
                                : "";
                        const vendors: PnlVendorLine[] = isCategory
                            ? (line.vendors ?? [])
                            : [];
                        return (
                            <PnlLineRows
                                key={line.key}
                                line={line}
                                periods={periods}
                                hint={hint}
                                emphasis={emphasis}
                                separator={SEPARATOR_BEFORE.has(line.key)}
                                columnCount={columnCount}
                                expandable={isCategory && vendors.length > 0}
                                isOpen={isOpen}
                                vendors={isOpen ? vendors : []}
                                onToggle={() => onToggle(line.key)}
                            />
                        );
                    })}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

function PnlLineRows({
    line,
    periods,
    hint,
    emphasis,
    separator,
    columnCount,
    expandable,
    isOpen,
    vendors,
    onToggle,
}: {
    line: PnlLine;
    periods: PnlPeriod[];
    hint: ColumnHint | undefined;
    emphasis: string;
    separator: boolean;
    columnCount: number;
    expandable: boolean;
    isOpen: boolean;
    vendors: PnlVendorLine[];
    onToggle: () => void;
}) {
    const label = hint ? (
        <HeaderHint hint={hint}>{line.label}</HeaderHint>
    ) : (
        line.label
    );
    return (
        <>
            {separator && (
                <TableRow>
                    <TableCell
                        colSpan={columnCount}
                        className="border-t border-theme-border p-0"
                    />
                </TableRow>
            )}
            <TableRow>
                <TableCell className={emphasis}>
                    {expandable ? (
                        <button
                            type="button"
                            onClick={onToggle}
                            className="inline-flex items-center gap-1.5 text-left hover:text-theme-text"
                        >
                            <span className="text-theme-text-soft">
                                {isOpen ? "▾" : "▸"}
                            </span>
                            {label}
                        </button>
                    ) : (
                        label
                    )}
                </TableCell>
                {periods.map((period) => (
                    <TableCell
                        key={period.key}
                        className={`${emphasis} ${pnlCellClass(line, period)}`.trim()}
                    >
                        {pnlCellText(line, period)}
                    </TableCell>
                ))}
                <TableCell className={emphasis}>
                    {line.kind === "net-margin"
                        ? "–"
                        : line.kind === "cash-pnl"
                          ? fmtPct(line.pctOfRevenue)
                          : fmtUnsignedPct(line.pctOfRevenue ?? null)}
                </TableCell>
            </TableRow>
            {vendors.map((vendor) => (
                <TableRow key={`${line.key}|${vendor.vendor}`}>
                    <TableCell className="pl-6 text-theme-text-soft">
                        {vendor.vendor}
                    </TableCell>
                    {periods.map((period) => (
                        <TableCell
                            key={period.key}
                            className={
                                period.kind === "delta"
                                    ? expenseDeltaTone(
                                          vendor.values[period.key] ?? null,
                                      )
                                    : "text-theme-text-soft"
                            }
                        >
                            {fmtUsd(vendor.values[period.key] ?? null)}
                        </TableCell>
                    ))}
                    <TableCell />
                </TableRow>
            ))}
        </>
    );
}

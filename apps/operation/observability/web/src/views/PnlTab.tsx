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
import type { Data } from "../types";

export function pnlTone(value: number | null) {
    if (value == null) return "";
    return value >= 0 ? "text-intent-success-text" : "text-intent-danger-text";
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
    if (line.kind === "net-margin") return fmtPct(value);
    // Delta columns are signed USD swings; a percentage-shaped line still reads
    // as a delta of its own unit — but only net-margin diverges, and it is
    // handled above, so the delta of a money line is money.
    return fmtUsd(value);
}

// Cell tone: cash-pnl and net-margin follow their sign; delta columns of money
// lines follow the swing's sign; the rest are neutral.
function pnlCellClass(line: PnlLine, period: PnlPeriod): string {
    const value = line.values[period.key] ?? null;
    if (line.kind === "cash-pnl" || line.kind === "net-margin") {
        return pnlTone(value);
    }
    if (period.kind === "delta") return pnlTone(value);
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

// One classic P&L statement: line items are rows, periods are columns. The
// rows never change with the filter — only the period columns do (year/all:
// months + YTD; month: prior · selected · Δ). Category rows expand inline to
// their vendor sub-rows in the same columns. Nothing swaps report shape.
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
            <StatCards items={pnlStatItems(statSource)} />
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
                                    expandable={
                                        isCategory && vendors.length > 0
                                    }
                                    isOpen={isOpen}
                                    vendors={isOpen ? vendors : []}
                                    onToggle={() => toggle(line.key)}
                                />
                            );
                        })}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
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
                                    ? pnlTone(vendor.values[period.key] ?? null)
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

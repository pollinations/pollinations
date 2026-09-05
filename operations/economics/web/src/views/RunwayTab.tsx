import {
    Alert,
    Chip,
    cn,
    Heading,
    TableBody,
    TableCell,
    TableDisclosureButton,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
} from "@pollinations/ui";
import { useMemo, useState } from "react";
import {
    DataTable,
    GROUP_BORDER,
    TableScroller,
} from "../components/DataTable";
import { StatCards, type StatTone } from "../components/StatCards";
import { categoryLabel } from "../lib/categories";
import type { ForecastPaymentTiming } from "../lib/forecastTerms";
import { fmtPeriod } from "../lib/format";
import { monthName } from "../lib/months";
import {
    buildRunway,
    type RunwayAssumption,
    type RunwayColumn,
    type RunwayMatrixRow,
} from "../lib/runway";
import { signedTone } from "../lib/tone";
import type { Data } from "../types";

function valueTone(value: number | null): StatTone {
    if (value == null || value === 0) return "base";
    return value > 0 ? "pos" : "neg";
}

export function runwayValueClass(value: number | null): string {
    if (value == null || value === 0) return "text-theme-text-soft";
    return signedTone(value);
}

export function runwayMonthLabel(month: string): string {
    const match = month.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!match) return month;
    return `${monthName(month)} ${match[1]}`;
}

export function runwayPeriodText({
    capped,
    exhaustedMonth,
    lastMonth,
}: {
    capped: boolean;
    exhaustedMonth: string | null;
    lastMonth: string | null;
}): string {
    if (exhaustedMonth) return runwayMonthLabel(exhaustedMonth);
    if (capped && lastMonth) return `${runwayMonthLabel(lastMonth)}+`;
    return "–";
}

export function fmtRunwayUsd(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const amount = new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
    }).format(Math.abs(value));
    return value < 0 ? `−$${amount}` : `$${amount}`;
}

export function fmtRunwayTableValue(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const amount = new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
    }).format(Math.abs(value));
    return value < 0 ? `−${amount}` : amount;
}

export function forecastMethodLabel(method: RunwayMatrixRow["forecastMethod"]) {
    if (method === "fixed") return "FIXED";
    if (method === "funded") return "FUNDED";
    if (method === "last") return "RUN RATE";
    if (method === "one_off") return "ONE-TIME";
    if (method === "mixed") return "MIXED";
    return null;
}

export function forecastMethodHint(method: RunwayMatrixRow["forecastMethod"]) {
    if (method === "fixed") return "Uses a fixed monthly amount.";
    if (method === "funded") {
        return "Covered by verified vendor credits or prepaid balance.";
    }
    if (method === "last") {
        return "Uses the latest reviewed monthly run rate.";
    }
    if (method === "one_off") return "Included only in this month.";
    if (method === "mixed") {
        return "Combines reviewed calculation methods. Hover a planned amount to see each component.";
    }
    return null;
}

export function paymentTimingLabel(timing: ForecastPaymentTiming | null) {
    if (timing === "direct") return "DIRECT";
    if (timing === "prepaid") return "PREPAID";
    if (timing === "postpaid") return "POSTPAID";
    return null;
}

export function paymentTimingHint(timing: ForecastPaymentTiming | null) {
    if (timing === "direct") {
        return "Cash moves in the projected month.";
    }
    if (timing === "prepaid") {
        return "The existing balance is consumed first; cash moves when a top-up is needed.";
    }
    if (timing === "postpaid") {
        return "Usage is paid after the service period.";
    }
    return null;
}

function ForecastBadge({ hint, label }: { hint: string; label: string }) {
    return (
        <Tooltip triggerAs="span" content={hint}>
            <Chip intent="neutral" size="sm">
                {label}
            </Chip>
        </Tooltip>
    );
}

function ForecastVendor({ row }: { row: RunwayMatrixRow }) {
    if (row.vendor === "processor settlement timing") {
        return (
            <Tooltip
                triggerAs="span"
                content="Wise Stripe payouts minus Pollen and Ko-fi sales after refunds, reversals, and fees. Transfers between the processor balance and the bank change cash, not sales."
            >
                <span>Stripe settlement timing</span>
            </Tooltip>
        );
    }
    const methodLabel = forecastMethodLabel(row.forecastMethod);
    const methodHint = forecastMethodHint(row.forecastMethod);
    const timingLabel = paymentTimingLabel(row.forecastPaymentTiming);
    const timingHint = paymentTimingHint(row.forecastPaymentTiming);
    return (
        <span className="inline-flex items-center gap-1.5">
            <span>{row.vendor}</span>
            {methodLabel && methodHint && (
                <ForecastBadge label={methodLabel} hint={methodHint} />
            )}
            {timingLabel && timingHint && (
                <ForecastBadge label={timingLabel} hint={timingHint} />
            )}
        </span>
    );
}

function ForecastValue({
    assumptions,
    value,
    issue,
}: {
    assumptions: RunwayAssumption[] | undefined;
    value: number;
    issue?: string;
}) {
    if (issue)
        return (
            <Tooltip triggerAs="span" content={issue}>
                <span>—</span>
            </Tooltip>
        );
    if (!assumptions?.length) return fmtRunwayTableValue(value);
    return (
        <Tooltip
            triggerAs="span"
            content={
                <span className="block max-w-72">
                    {assumptions.map((assumption) => (
                        <span className="block" key={assumption.entry_id}>
                            <strong>{assumption.source || "unknown"}</strong>
                            {`: ${assumption.evidence || assumption.entry_id}`}
                        </span>
                    ))}
                </span>
            }
        >
            <span className="underline decoration-dotted decoration-theme-border underline-offset-2">
                {fmtRunwayTableValue(value)}
            </span>
        </Tooltip>
    );
}

function monthColumnClass(column: RunwayColumn, first: boolean) {
    return cn(
        "min-w-28 whitespace-nowrap",
        first && GROUP_BORDER,
        column.kind === "current" && "bg-intent-warning-bg-light/40",
        column.kind === "forecast" && "bg-theme-bg-subtle",
    );
}

function monthKindLabel(kind: RunwayColumn["kind"]): string | null {
    if (kind === "actual") return null;
    if (kind === "current") return "To date";
    return "Plan";
}

function startsMonthGroup(columns: RunwayColumn[], index: number) {
    return index === 0 || columns[index - 1]?.month !== columns[index].month;
}

type RunwayGroup = {
    category: string;
    rows: RunwayMatrixRow[];
    values: Record<string, number | null>;
};

function groupRows(
    rows: RunwayMatrixRow[],
    columns: RunwayColumn[],
): RunwayGroup[] {
    const groups = new Map<string, RunwayGroup>();
    for (const row of rows) {
        const group: RunwayGroup = groups.get(row.category) ?? {
            category: row.category,
            rows: [],
            values: Object.fromEntries(columns.map((column) => [column.id, 0])),
        };
        group.rows.push(row);
        for (const column of columns) {
            const previous = group.values[column.id];
            group.values[column.id] =
                previous == null ||
                (column.kind === "forecast" && row.forecastIssue)
                    ? null
                    : previous + (row.values[column.id] ?? 0);
        }
        groups.set(row.category, group);
    }
    return [...groups.values()];
}

function SummaryRow({
    label,
    columns,
    value,
}: {
    label: string;
    columns: RunwayColumn[];
    value: (column: RunwayColumn) => number | null;
}) {
    return (
        <TableRow className="font-semibold">
            <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-surface-opaque">
                {label}
            </TableCell>
            {columns.map((column, index) => (
                <TableCell
                    key={column.id}
                    align="right"
                    numeric
                    className={cn(
                        monthColumnClass(
                            column,
                            startsMonthGroup(columns, index),
                        ),
                        runwayValueClass(value(column)),
                    )}
                >
                    {fmtRunwayTableValue(value(column))}
                </TableCell>
            ))}
        </TableRow>
    );
}

export function RunwayTab({ data, year }: { data: Data; year: string }) {
    const runway = useMemo(
        () =>
            buildRunway(
                data.opTransactions ?? [],
                new Date(),
                data.opCloud ?? [],
                data.privateConfig?.forecastRules,
                data.stripeSales ?? [],
            ),
        [
            data.opCloud,
            data.opTransactions,
            data.privateConfig?.forecastRules,
            data.stripeSales,
        ],
    );
    const columns = useMemo(
        () => runway.columns.filter((column) => column.month.startsWith(year)),
        [runway.columns, year],
    );
    const groups = useMemo(
        () => groupRows(runway.rows, columns),
        [columns, runway.rows],
    );
    const next = runway.columns.find(
        (column) =>
            column.month > runway.currentMonth && column.kind === "forecast",
    );
    const nextPlanFacts = next
        ? runway.assumptions.filter(
              (assumption) => assumption.month.slice(0, 7) === next.month,
          ).length
        : 0;
    const nextChange =
        nextPlanFacts > 0 && next?.forecastComplete !== false
            ? (next?.netUsd ?? null)
            : null;
    const last = runway.columns.at(-1);
    const runwayTone: StatTone =
        runway.runwayMonths == null
            ? "base"
            : runway.runwayMonths <= 1
              ? "neg"
              : runway.runwayMonths <= 3
                ? "warn"
                : "base";

    return (
        <div className="flex flex-col gap-4">
            {runway.flags.length > 0 && (
                <Alert intent="warning" title="Needs attention">
                    <ul className="list-disc space-y-1 pl-5">
                        {runway.flags.map((flag) => (
                            <li key={flag}>{flag}</li>
                        ))}
                    </ul>
                </Alert>
            )}
            <StatCards
                items={[
                    {
                        label: "Cash now",
                        value: fmtRunwayUsd(runway.currentCashUsd),
                        tone:
                            runway.currentCashUsd != null &&
                            runway.currentCashUsd < 0
                                ? "neg"
                                : "base",
                        detail:
                            runway.openingBalanceDate == null
                                ? "opening balance missing"
                                : runway.latestTransactionDate
                                  ? `bank movements through ${fmtPeriod(runway.latestTransactionDate)} · anchored ${fmtPeriod(runway.openingBalanceDate)}`
                                  : `anchored ${fmtPeriod(runway.openingBalanceDate)} · no bank movements`,
                    },
                    {
                        label: `${monthName(runway.currentMonth)} month-end cash`,
                        value: fmtRunwayUsd(runway.projectedMonthEndCashUsd),
                        tone:
                            runway.projectedMonthEndCashUsd != null &&
                            runway.projectedMonthEndCashUsd < 0
                                ? "neg"
                                : "base",
                        detail:
                            runway.remainingCurrentPlanUsd == null
                                ? "plan unavailable"
                                : `${fmtRunwayUsd(runway.remainingCurrentPlanUsd)} remaining plan`,
                    },
                    {
                        label: next
                            ? `${monthName(next.month)} cash change`
                            : "Next cash change",
                        value: fmtRunwayUsd(nextChange),
                        tone: valueTone(nextChange),
                        detail:
                            nextChange != null
                                ? `${nextPlanFacts} forecast line${nextPlanFacts === 1 ? "" : "s"}`
                                : "plan unavailable",
                    },
                    {
                        label: "Cash runway",
                        value: runwayPeriodText({
                            capped: runway.runwayCapped,
                            exhaustedMonth: runway.runwayExhaustedMonth,
                            lastMonth: last?.month ?? null,
                        }),
                        tone: runwayTone,
                        detail: runway.runwayExhaustedMonth
                            ? "cash becomes negative during this month"
                            : runway.runwayCapped && last
                              ? `${runway.runwayMonths}+ forecast months · still positive at horizon`
                              : "forecast unavailable",
                    },
                ]}
            />
            {data.userBalances?.[0] ? (
                <section className="flex flex-col gap-2">
                    <Heading as="h2" size="card">
                        <Tooltip
                            triggerAs="span"
                            content={`Current balances users can spend without another payment. They cannot be cashed out and are not deducted from cash runway. D1 snapshot: ${fmtPeriod(data.userBalances[0].synced_at)}.`}
                        >
                            <span className="cursor-help">Unspent Pollen</span>
                        </Tooltip>
                    </Heading>
                    <StatCards
                        items={[
                            {
                                label: "Paid Pollen",
                                value: fmtRunwayTableValue(
                                    data.userBalances[0].paid_balance,
                                ),
                                detail: `${fmtRunwayTableValue(data.userBalances[0].paid_users)} users · full catalog`,
                            },
                            {
                                label: "Quest Pollen",
                                value: fmtRunwayTableValue(
                                    data.userBalances[0].quest_balance,
                                ),
                                detail: `${fmtRunwayTableValue(data.userBalances[0].quest_users)} users · restricted catalog`,
                            },
                        ]}
                    />
                </section>
            ) : null}
            <TableScroller>
                <DataTable className="min-w-max">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell className="sticky left-0 z-20 min-w-48 bg-surface-opaque">
                                <span className="sr-only">Line item</span>
                            </TableHeaderCell>
                            {columns.map((column, index) => (
                                <TableHeaderCell
                                    key={column.id}
                                    align="right"
                                    className={monthColumnClass(
                                        column,
                                        startsMonthGroup(columns, index),
                                    )}
                                >
                                    <span className="inline-flex flex-col items-end">
                                        <span>{monthName(column.month)}</span>
                                        {monthKindLabel(column.kind) && (
                                            <span className="text-micro font-medium uppercase tracking-wide opacity-70">
                                                {monthKindLabel(column.kind)}
                                            </span>
                                        )}
                                    </span>
                                </TableHeaderCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        <SummaryRow
                            label="Expenses"
                            columns={columns}
                            value={(column) =>
                                column.forecastComplete === false
                                    ? null
                                    : column.totalExpensesUsd
                            }
                        />
                        <SummaryRow
                            label="Revenue less expenses"
                            columns={columns}
                            value={(column) =>
                                column.forecastComplete === false
                                    ? null
                                    : column.operatingResultUsd
                            }
                        />
                        <SummaryRow
                            label="Cash change"
                            columns={columns}
                            value={(column) =>
                                column.forecastComplete === false
                                    ? null
                                    : column.netUsd
                            }
                        />
                        <SummaryRow
                            label="Cash balance"
                            columns={columns}
                            value={(column) => column.runningCashUsd}
                        />
                        {groups.map((group) => (
                            <RunwayCategoryRows
                                key={group.category}
                                group={group}
                                columns={columns}
                            />
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

function RunwayCategoryRows({
    group,
    columns,
}: {
    group: RunwayGroup;
    columns: RunwayColumn[];
}) {
    const [expanded, setExpanded] = useState(false);

    return (
        <>
            <TableRow className="bg-theme-bg-subtle font-semibold">
                <TableCell
                    className={cn(
                        "sticky left-0 z-10 whitespace-nowrap bg-surface-opaque",
                        group.category === "revenue" &&
                            "text-outcome-positive-text",
                    )}
                >
                    <TableDisclosureButton
                        expanded={expanded}
                        onClick={() => setExpanded((current) => !current)}
                    >
                        {categoryLabel(group.category)}
                    </TableDisclosureButton>
                </TableCell>
                {columns.map((column, index) => (
                    <TableCell
                        key={column.id}
                        align="right"
                        numeric
                        className={cn(
                            monthColumnClass(
                                column,
                                startsMonthGroup(columns, index),
                            ),
                            runwayValueClass(group.values[column.id]),
                        )}
                    >
                        {fmtRunwayTableValue(group.values[column.id])}
                    </TableCell>
                ))}
            </TableRow>
            {expanded &&
                group.rows.map((row) => (
                    <TableRow key={`${row.category}|${row.vendor}`}>
                        <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-surface-opaque pl-6 text-theme-text-soft">
                            <ForecastVendor row={row} />
                        </TableCell>
                        {columns.map((column, index) => (
                            <TableCell
                                key={column.id}
                                align="right"
                                numeric
                                className={cn(
                                    monthColumnClass(
                                        column,
                                        startsMonthGroup(columns, index),
                                    ),
                                    runwayValueClass(row.values[column.id]),
                                )}
                            >
                                <ForecastValue
                                    assumptions={row.assumptions[column.id]}
                                    value={row.values[column.id]}
                                    issue={
                                        column.kind === "forecast"
                                            ? row.forecastIssue
                                            : undefined
                                    }
                                />
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
        </>
    );
}

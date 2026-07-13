import {
    Alert,
    Chip,
    cn,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    GROUP_BORDER,
    TableScroller,
} from "../components/DataTable";
import { StatCards, type StatTone } from "../components/StatCards";
import { fmtPeriod, fmtUsd } from "../lib/format";
import { monthLabel } from "../lib/months";
import {
    buildRunway,
    type RunwayAssumption,
    type RunwayColumn,
    type RunwayMatrixRow,
} from "../lib/runway";
import { signedTone } from "../lib/tone";
import type { Data } from "../types";

const CATEGORY_LABELS: Record<string, string> = {
    revenue: "Revenue",
    cloud: "Cloud",
    saas: "SaaS",
    office: "Office",
    admin: "Admin",
    payroll: "Payroll",
};

function categoryLabel(category: string) {
    return (
        CATEGORY_LABELS[category] ??
        category.charAt(0).toUpperCase() + category.slice(1)
    );
}

function valueTone(value: number | null): StatTone {
    if (value == null || value === 0) return "base";
    return value > 0 ? "pos" : "neg";
}

export function runwayValueClass(value: number | null): string {
    if (value == null || value === 0) return "text-theme-text-soft";
    return signedTone(value);
}

export function runwayText(months: number | null, capped: boolean): string {
    if (months == null) return "–";
    return `${months}${capped ? "+" : ""} month${months === 1 ? "" : "s"}`;
}

export function assumptionTitle(assumptions: RunwayAssumption[] | undefined) {
    if (!assumptions?.length) return undefined;
    return assumptions
        .map(
            (assumption) =>
                `${assumption.source || "unknown"}: ${assumption.evidence || assumption.entry_id}`,
        )
        .join("\n");
}

export function forecastMethodLabel(method: RunwayMatrixRow["forecastMethod"]) {
    if (method === "last") return "LAST";
    if (method === "zero") return "0";
    return null;
}

function ForecastValue({
    assumptions,
    value,
}: {
    assumptions: RunwayAssumption[] | undefined;
    value: number;
}) {
    if (!assumptions?.length) return fmtUsd(value);
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
                {fmtUsd(value)}
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

function monthKindLabel(kind: RunwayColumn["kind"]) {
    if (kind === "current") return "Current";
    return kind;
}

function startsMonthGroup(columns: RunwayColumn[], index: number) {
    return index === 0 || columns[index - 1]?.month !== columns[index].month;
}

type RunwayGroup = {
    category: string;
    rows: RunwayMatrixRow[];
    values: Record<string, number>;
};

function groupRows(
    rows: RunwayMatrixRow[],
    columns: RunwayColumn[],
): RunwayGroup[] {
    const groups = new Map<string, RunwayGroup>();
    for (const row of rows) {
        const group = groups.get(row.category) ?? {
            category: row.category,
            rows: [],
            values: Object.fromEntries(columns.map((column) => [column.id, 0])),
        };
        group.rows.push(row);
        for (const column of columns) {
            group.values[column.id] += row.values[column.id] ?? 0;
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
                    {fmtUsd(value(column))}
                </TableCell>
            ))}
        </TableRow>
    );
}

export function RunwayTab({ data }: { data: Data }) {
    const runway = useMemo(
        () =>
            buildRunway(
                data.opTransactions ?? [],
                data.opRunway ?? [],
                new Date(),
            ),
        [data.opRunway, data.opTransactions],
    );
    const groups = useMemo(
        () => groupRows(runway.rows, runway.columns),
        [runway.columns, runway.rows],
    );
    const currentMtd = runway.columns.find(
        (column) => column.kind === "current",
    );
    const currentForecast = runway.columns.find(
        (column) =>
            column.month === runway.currentMonth && column.kind === "forecast",
    );
    const next = runway.columns.find(
        (column) =>
            column.month > runway.currentMonth && column.kind === "forecast",
    );
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
                <Alert intent="warning" title="Runway caveats">
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
                        label: "Current cash",
                        value: fmtUsd(runway.mtdCashUsd),
                        tone:
                            runway.mtdCashUsd != null && runway.mtdCashUsd < 0
                                ? "neg"
                                : "base",
                        detail: runway.openingBalanceDate
                            ? `opening + ${fmtUsd(currentMtd?.netUsd)} Current Wise · ${fmtPeriod(runway.openingBalanceDate)}`
                            : "opening balance missing",
                    },
                    {
                        label: "Month-end forecast",
                        value: fmtUsd(runway.projectedMonthEndCashUsd),
                        tone:
                            runway.projectedMonthEndCashUsd != null &&
                            runway.projectedMonthEndCashUsd < 0
                                ? "neg"
                                : "base",
                        detail: `opening + ${fmtUsd(currentForecast?.netUsd)} full-month forecast`,
                    },
                    {
                        label: "Runway",
                        value: runwayText(
                            runway.runwayMonths,
                            runway.runwayCapped,
                        ),
                        tone: runwayTone,
                        detail: runway.runwayExhaustedMonth
                            ? `runs out ${monthLabel(runway.runwayExhaustedMonth)}`
                            : runway.runwayCapped && last
                              ? `positive through ${monthLabel(last.month)}`
                              : "forecast unavailable",
                    },
                    {
                        label: "Next month net",
                        value: fmtUsd(next?.netUsd),
                        tone: valueTone(next?.netUsd ?? null),
                        detail: `${runway.assumptions.length} explicit forecast fact${runway.assumptions.length === 1 ? "" : "s"}`,
                    },
                ]}
            />
            <TableScroller>
                <DataTable className="min-w-max">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell className="sticky left-0 z-20 min-w-48 bg-surface-opaque">
                                line item
                            </TableHeaderCell>
                            {runway.columns.map((column, index) => (
                                <TableHeaderCell
                                    key={column.id}
                                    align="right"
                                    className={monthColumnClass(
                                        column,
                                        startsMonthGroup(runway.columns, index),
                                    )}
                                >
                                    <span className="inline-flex flex-col items-end">
                                        <span>{monthLabel(column.month)}</span>
                                        <span className="text-[0.65rem] font-medium uppercase tracking-wide opacity-70">
                                            {monthKindLabel(column.kind)}
                                        </span>
                                    </span>
                                </TableHeaderCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        <SummaryRow
                            label="Total expenses"
                            columns={runway.columns}
                            value={(column) => column.totalExpensesUsd}
                        />
                        <SummaryRow
                            label="Net cash"
                            columns={runway.columns}
                            value={(column) => column.netUsd}
                        />
                        <SummaryRow
                            label="Running cash"
                            columns={runway.columns}
                            value={(column) => column.runningCashUsd}
                        />
                        {groups.map((group) => (
                            <RunwayCategoryRows
                                key={group.category}
                                group={group}
                                columns={runway.columns}
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
    return (
        <>
            <TableRow className="bg-theme-bg-subtle font-semibold">
                <TableCell
                    className={cn(
                        "sticky left-0 z-10 whitespace-nowrap bg-theme-bg-subtle",
                        group.category === "revenue" &&
                            "text-intent-success-text",
                    )}
                >
                    {categoryLabel(group.category)}
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
                        {fmtUsd(group.values[column.id])}
                    </TableCell>
                ))}
            </TableRow>
            {group.rows.map((row) => (
                <TableRow key={`${row.category}|${row.vendor}`}>
                    <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-surface-opaque pl-6 text-theme-text-soft">
                        <span className="inline-flex items-center gap-2">
                            <span>{row.vendor}</span>
                            {forecastMethodLabel(row.forecastMethod) && (
                                <Chip
                                    intent={
                                        row.forecastMethod === "zero"
                                            ? "warning"
                                            : "neutral"
                                    }
                                    size="sm"
                                >
                                    {forecastMethodLabel(row.forecastMethod)}
                                </Chip>
                            )}
                        </span>
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
                            />
                        </TableCell>
                    ))}
                </TableRow>
            ))}
        </>
    );
}

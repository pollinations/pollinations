import {
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
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { StatCards } from "../components/StatCards";
import { fmtPeriod, fmtUnsignedPct, fmtUsd } from "../lib/format";
import { creditRunway, type RunwayRow } from "../lib/insights";
import type { Data } from "../types";

export function visibleRunwayRows(rows: RunwayRow[], vendor: string) {
    return rows.filter((row) => vendor === "all" || row.vendor === vendor);
}

// Urgency color for a depletion date: red under 30 days, amber under 90.
export function depletionTone(date: string | null, now: Date): string {
    if (!date) return "text-theme-text-soft";
    const days = (Date.parse(date) - now.getTime()) / 86_400_000;
    if (days < 30) return "text-intent-danger-text";
    if (days < 90) return "text-intent-warning-text";
    return "text-theme-text-soft";
}

// Same 30/90-day urgency, mapped to a stat-card tone.
function depletionStatTone(
    date: string,
    now: Date,
): "base" | "pos" | "neg" | "warn" {
    const days = (Date.parse(date) - now.getTime()) / 86_400_000;
    if (days < 30) return "neg";
    if (days < 90) return "warn";
    return "base";
}

function remainingTone(value: number) {
    return value < 0 ? "text-intent-danger-text" : "";
}

function optionalBurn(value: number) {
    return value > 0.005 ? fmtUsd(value) : "–";
}

export function burnedPct(row: Pick<RunwayRow, "burnedUsd" | "grantedUsd">) {
    if (row.grantedUsd <= 0) return null;
    return (row.burnedUsd / row.grantedUsd) * 100;
}

export function isActiveCreditRow(row: Pick<RunwayRow, "finished">) {
    return !row.finished;
}

function ActiveDot({ active }: { active: boolean }) {
    return (
        <span
            role="img"
            aria-label={active ? "active" : "inactive"}
            title={active ? "active" : "inactive"}
            className={`inline-block h-2.5 w-2.5 rounded-full ${
                active ? "bg-intent-success-text" : "bg-intent-danger-text"
            }`}
        />
    );
}

function GrantsHint({ row }: { row: RunwayRow }) {
    return (
        <Tooltip
            triggerAs="span"
            content={
                <span className="block max-w-72">
                    {row.grants.map((grant) => (
                        <span
                            className="block"
                            key={`${grant.label}|${grant.startDate}`}
                        >
                            {grant.label || "unlabeled"} ·{" "}
                            {fmtUsd(grant.grantedUsd)} · from{" "}
                            {fmtPeriod(grant.startDate)}
                            {grant.expires
                                ? ` · expires ${fmtPeriod(grant.expires)}`
                                : ""}
                        </span>
                    ))}
                </span>
            }
        >
            <span>{row.vendor}</span>
        </Tooltip>
    );
}

export function CreditsTab({
    data,
    vendor = "all",
}: {
    data: Data;
    vendor?: string;
}) {
    const now = useMemo(() => new Date(), []);
    const allRows = useMemo(() => creditRunway(data, now), [data, now]);
    const rows = useMemo(
        () => visibleRunwayRows(allRows, vendor),
        [allRows, vendor],
    );
    const totals = useMemo(() => {
        let granted = 0;
        let burned = 0;
        let remaining = 0;
        let vendors = 0;
        let next: {
            vendor: string;
            date: string;
            reason: string | null;
        } | null = null;
        for (const row of rows) {
            granted += row.grantedUsd;
            burned += row.burnedUsd;
            remaining += row.remainingUsd;
            vendors += 1;
            if (
                !row.finished &&
                row.depletionDate != null &&
                (next == null || row.depletionDate < next.date)
            ) {
                next = {
                    vendor: row.vendor,
                    date: row.depletionDate,
                    reason: row.depletionReason,
                };
            }
        }
        return { granted, burned, remaining, vendors, next };
    }, [rows]);
    const burnedPctTotal =
        totals.granted > 0 ? (totals.burned / totals.granted) * 100 : null;

    const sortColumns = useMemo<SortColumn<RunwayRow>[]>(
        () => [
            { key: "active", value: (row) => isActiveCreditRow(row) },
            { key: "vendor", value: (row) => row.vendor },
            { key: "grantedUsd", value: (row) => row.grantedUsd },
            { key: "burnedPct", value: (row) => burnedPct(row) },
            { key: "preWindowBurnUsd", value: (row) => row.preWindowBurnUsd },
            { key: "remainingUsd", value: (row) => row.remainingUsd },
            {
                key: "currentMonthBurnUsd",
                value: (row) => row.currentMonthBurnUsd,
            },
            { key: "lastMonthBurnUsd", value: (row) => row.lastMonthBurnUsd },
            { key: "depletionDate", value: (row) => row.depletionDate },
        ],
        [],
    );
    const { headerProps, rows: sorted } = useSortableRows(rows, sortColumns);

    return (
        <div className="flex flex-col gap-4">
            <StatCards
                items={[
                    {
                        label: "Granted",
                        value: fmtUsd(totals.granted),
                        detail: `${totals.vendors} vendor${totals.vendors === 1 ? "" : "s"}`,
                    },
                    {
                        label: "Burned",
                        value: fmtUnsignedPct(burnedPctTotal),
                        detail: fmtUsd(totals.burned),
                    },
                    {
                        label: "Remaining",
                        value: fmtUsd(totals.remaining),
                        detail: "naive upper bound",
                    },
                    {
                        label: "Next runs out",
                        value: (
                            <span className="text-xl leading-tight">
                                {totals.next
                                    ? `${totals.next.vendor} · ${fmtPeriod(totals.next.date)}`
                                    : "–"}
                            </span>
                        ),
                        tone: totals.next
                            ? depletionStatTone(totals.next.date, now)
                            : "base",
                        detail: totals.next
                            ? totals.next.reason === "expiry"
                                ? "grant expiry"
                                : "at current rate"
                            : "no runway risk",
                    },
                ]}
            />
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                {...headerProps("active")}
                                align="center"
                            >
                                <HeaderHint hint="green = credit remains in the pool. red = the pool is finished; rows are muted but kept in the same table for context.">
                                    active
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("vendor")}>
                                vendor
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("grantedUsd")}
                                align="right"
                                className={GROUP_BORDER}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Total grants for the vendor (hover the vendor for the per-grant split). EUR converted at the grant's start month.",
                                        tables: "op_cloud_api",
                                        sources: "API, CLI, BQ, HC",
                                    }}
                                >
                                    Granted
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("burnedPct")}
                                align="right"
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Credit used as a share of granted credit.",
                                        tables: "op_cloud_api",
                                        formula: "burned ÷ granted",
                                    }}
                                >
                                    Burned %
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("preWindowBurnUsd")}
                                align="right"
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Opening credit burn before the 2026 window. Stored as OP Cloud rows named pre-2026 grant burn, hidden from the Cloud OP raw table.",
                                        tables: "op_cloud_api",
                                        formula: "-credit",
                                    }}
                                >
                                    2025
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("remainingUsd")}
                                align="right"
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Granted minus credit used. Includes 2025 opening burn when that balance is recorded.",
                                        formula: "granted − burned",
                                    }}
                                >
                                    Remaining
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("currentMonthBurnUsd")}
                                align="right"
                                className={GROUP_BORDER}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Credit burn so far in the running month.",
                                        tables: "op_cloud_api",
                                    }}
                                >
                                    This Month
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("lastMonthBurnUsd")}
                                align="right"
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Credit burn in the last complete month.",
                                        tables: "op_cloud_api",
                                    }}
                                >
                                    Last Month
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("depletionDate")}
                                className={GROUP_BORDER}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Estimated date the credit runs out at the recent burn rate, or the grant's expiry — whichever is sooner. Red under 30 days, amber under 90.",
                                    }}
                                >
                                    Runs Out
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(sorted, (row) => row.vendor).map(
                            ({ key, row }) => (
                                <TableRow
                                    key={key}
                                    className={
                                        row.finished ? "opacity-60" : undefined
                                    }
                                >
                                    <TableCell className="text-center">
                                        <ActiveDot
                                            active={isActiveCreditRow(row)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <GrantsHint row={row} />
                                    </TableCell>
                                    <TableCell
                                        className={cn(
                                            GROUP_BORDER,
                                            "text-right",
                                        )}
                                    >
                                        {fmtUsd(row.grantedUsd)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {fmtUnsignedPct(burnedPct(row))}
                                    </TableCell>
                                    <TableCell className="text-right text-theme-text-soft">
                                        {optionalBurn(row.preWindowBurnUsd)}
                                    </TableCell>
                                    <TableCell
                                        className={cn(
                                            "text-right",
                                            remainingTone(row.remainingUsd),
                                        )}
                                    >
                                        {fmtUsd(row.remainingUsd)}
                                    </TableCell>
                                    <TableCell
                                        className={cn(
                                            GROUP_BORDER,
                                            "text-right text-theme-text-soft",
                                        )}
                                    >
                                        {fmtUsd(row.currentMonthBurnUsd)}
                                    </TableCell>
                                    <TableCell className="text-right text-theme-text-soft">
                                        {fmtUsd(row.lastMonthBurnUsd)}
                                    </TableCell>
                                    <TableCell
                                        className={cn(
                                            GROUP_BORDER,
                                            depletionTone(
                                                row.depletionDate,
                                                now,
                                            ),
                                        )}
                                    >
                                        {row.finished
                                            ? row.finishedDate
                                                ? fmtPeriod(row.finishedDate)
                                                : "–"
                                            : row.depletionDate
                                              ? `${fmtPeriod(row.depletionDate)}${row.depletionReason === "expiry" ? " (expiry)" : ""}`
                                              : "–"}
                                    </TableCell>
                                </TableRow>
                            ),
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

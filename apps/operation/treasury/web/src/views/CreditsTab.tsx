import {
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
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { StatCards } from "../components/StatCards";
import { fmtPeriod, fmtUnsignedPct, fmtUsd } from "../lib/format";
import {
    creditRunway,
    type RunwayRow,
    ungrantedCreditBurn,
} from "../lib/insights";
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
    const ungranted = useMemo(
        () =>
            ungrantedCreditBurn(data, now).filter(
                (row) => vendor === "all" || row.vendor === vendor,
            ),
        [data, now, vendor],
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
                        label: "Next depletion",
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
                            <TableHeaderCell {...headerProps("grantedUsd")}>
                                <HeaderHint hint="Σ grants for the vendor (hover the vendor for the per-grant split). EUR converted at the grant's start month.">
                                    granted
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("burnedPct")}>
                                <HeaderHint hint="Witnessed credit burn as a share of granted credit: burned ÷ granted. Burn is Σ provider_monthly.credit across the whole window (2026-01+).">
                                    burned
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("remainingUsd")}>
                                <HeaderHint hint="granted − witnessed burned dollars, naive. For grants that started before 2026 this is an upper bound because pre-window burn is unwitnessed.">
                                    remaining
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("currentMonthBurnUsd")}
                            >
                                <HeaderHint hint="Credit burn so far in the running month. Depletion uses this as the live daily intensity when it is nonzero.">
                                    this month
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("lastMonthBurnUsd")}
                            >
                                <HeaderHint hint="Credit burn in the last complete month. Used as the fallback only when this month has no burn yet.">
                                    last month
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("depletionDate")}>
                                <HeaderHint hint="Active rows show the earlier of credit exhaustion and the next grant expiry. Burn depletion uses last full month as the base, deducts this month's consumed credit, then projects runway from this month's daily intensity. Finished rows show when the pool ended. Red < 30 days, amber < 90.">
                                    depletion
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
                                    <TableCell>
                                        {fmtUsd(row.grantedUsd)}
                                    </TableCell>
                                    <TableCell>
                                        {fmtUnsignedPct(burnedPct(row))}
                                    </TableCell>
                                    <TableCell
                                        className={remainingTone(
                                            row.remainingUsd,
                                        )}
                                    >
                                        {fmtUsd(row.remainingUsd)}
                                    </TableCell>
                                    <TableCell className="text-theme-text-soft">
                                        {fmtUsd(row.currentMonthBurnUsd)}
                                    </TableCell>
                                    <TableCell className="text-theme-text-soft">
                                        {fmtUsd(row.lastMonthBurnUsd)}
                                    </TableCell>
                                    <TableCell
                                        className={depletionTone(
                                            row.depletionDate,
                                            now,
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
            {ungranted.length > 0 && (
                <div className="flex flex-col gap-2">
                    <TableScroller>
                        <DataTable>
                            <TableHead>
                                <TableRow>
                                    <TableHeaderCell>vendor</TableHeaderCell>
                                    <TableHeaderCell>burned</TableHeaderCell>
                                    <TableHeaderCell>
                                        this month
                                    </TableHeaderCell>
                                    <TableHeaderCell>
                                        last month
                                    </TableHeaderCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {ungranted.map((row) => (
                                    <TableRow key={row.vendor}>
                                        <TableCell>{row.vendor}</TableCell>
                                        <TableCell>
                                            {fmtUsd(row.burnedUsd)}
                                        </TableCell>
                                        <TableCell className="text-theme-text-soft">
                                            {fmtUsd(row.currentMonthBurnUsd)}
                                        </TableCell>
                                        <TableCell className="text-theme-text-soft">
                                            {fmtUsd(row.lastMonthBurnUsd)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </DataTable>
                    </TableScroller>
                </div>
            )}
        </div>
    );
}

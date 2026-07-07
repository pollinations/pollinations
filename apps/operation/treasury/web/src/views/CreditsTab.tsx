import {
    Chip,
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

function visibleFlags(row: RunwayRow) {
    return row.flags.filter((flag) => !flag.startsWith("lapsed "));
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

    const totals = useMemo(
        () =>
            rows.reduce(
                (acc, row) => ({
                    granted: acc.granted + row.grantedUsd,
                    burned: acc.burned + row.burnedUsd,
                    remaining: acc.remaining + row.remainingUsd,
                    burning:
                        acc.burning + (row.currentMonthBurnUsd > 0 ? 1 : 0),
                }),
                { granted: 0, burned: 0, remaining: 0, burning: 0 },
            ),
        [rows],
    );

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
            { key: "flags", value: (row) => row.flags.join(", ") },
        ],
        [],
    );
    const { headerProps, rows: sorted } = useSortableRows(rows, sortColumns);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    granted {fmtUsd(totals.granted)}
                </Chip>
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    burned{" "}
                    {fmtUnsignedPct(
                        totals.granted > 0
                            ? (totals.burned / totals.granted) * 100
                            : null,
                    )}
                </Chip>
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    remaining {fmtUsd(totals.remaining)} (naive)
                </Chip>
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    {totals.burning} burning this month
                </Chip>
            </div>
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
                                <HeaderHint hint="granted − witnessed burned dollars, naive. For grants that started before 2026 this is an upper bound (pre-window burn is unwitnessed) — see flags.">
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
                            <TableHeaderCell {...headerProps("flags")}>
                                <HeaderHint hint="pre-window burn unwitnessed = grant older than the data window, remaining is an upper bound · over-burn = burned more than granted (grant figure or credit rows need a look) · exhausted = pool fully consumed.">
                                    flags
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
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {visibleFlags(row).map((flag) => (
                                                <Chip
                                                    key={flag}
                                                    intent={
                                                        flag === "over-burn"
                                                            ? "danger"
                                                            : flag ===
                                                                "exhausted"
                                                              ? "neutral"
                                                              : "warning"
                                                    }
                                                    size="sm"
                                                >
                                                    {flag}
                                                </Chip>
                                            ))}
                                        </div>
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

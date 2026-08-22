import {
    cn,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { Fragment, useMemo, useState } from "react";
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
import { fmtPeriod, fmtUsd } from "../lib/format";
import { type ProviderBalanceRow, providerBalanceRows } from "../lib/insights";
import { providerAuditUrl } from "../lib/providerRegistry";
import type { Data } from "../types";

// Urgency color for a depletion date: red under 30 days, amber under 90.
export function depletionTone(date: string | null, now: Date): string {
    if (!date) return "text-theme-text-soft";
    const days = (Date.parse(date) - now.getTime()) / 86_400_000;
    if (days < 30) return "text-intent-danger-text";
    if (days < 90) return "text-intent-warning-text";
    return "text-theme-text-soft";
}

export function isActiveBalanceRow(row: Pick<ProviderBalanceRow, "finished">) {
    return !row.finished;
}

function balanceTone(value: number | null) {
    return value != null && value < -0.005 ? "text-intent-danger-text" : "";
}

function optionalUsd(value: number | null) {
    return value == null ? "–" : fmtUsd(value);
}

function BalanceHistory({ row }: { row: ProviderBalanceRow }) {
    return (
        <div className="overflow-x-auto p-2">
            <DataTable className="text-sm">
                <TableHead>
                    <TableRow>
                        <TableHeaderCell rowSpan={2}>Month</TableHeaderCell>
                        <TableHeaderCell
                            colSpan={5}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Free credit
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={4}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Cash prepaid
                        </TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell align="right" className={GROUP_BORDER}>
                            Opening
                        </TableHeaderCell>
                        <TableHeaderCell align="right">Added</TableHeaderCell>
                        <TableHeaderCell align="right">Used</TableHeaderCell>
                        <TableHeaderCell align="right">Lapsed</TableHeaderCell>
                        <TableHeaderCell align="right">Closing</TableHeaderCell>
                        <TableHeaderCell align="right" className={GROUP_BORDER}>
                            Opening
                        </TableHeaderCell>
                        <TableHeaderCell align="right">Added</TableHeaderCell>
                        <TableHeaderCell align="right">Used</TableHeaderCell>
                        <TableHeaderCell align="right">Closing</TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {row.history.map((month) => (
                        <TableRow key={month.month}>
                            <TableCell className="whitespace-nowrap">
                                {fmtPeriod(month.month)}
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className={GROUP_BORDER}
                            >
                                {optionalUsd(month.creditOpeningUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {optionalUsd(month.creditAddedUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {optionalUsd(month.creditUsedUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {optionalUsd(month.creditLapsedUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {optionalUsd(month.creditClosingUsd)}
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className={cn(
                                    GROUP_BORDER,
                                    balanceTone(month.cashOpeningUsd),
                                )}
                            >
                                {optionalUsd(month.cashOpeningUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {optionalUsd(month.cashAddedUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {optionalUsd(month.cashUsedUsd)}
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className={balanceTone(month.cashClosingUsd)}
                            >
                                {optionalUsd(month.cashClosingUsd)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </div>
    );
}

export function BalancesTab({ data }: { data: Data }) {
    const now = useMemo(() => new Date(), []);
    const rows = useMemo(() => providerBalanceRows(data, now), [data, now]);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const totals = useMemo(() => {
        let cashBalance = 0;
        let creditBalance = 0;
        for (const row of rows) {
            cashBalance += Math.max(row.cashBalanceUsd ?? 0, 0);
            creditBalance += Math.max(row.creditBalanceUsd ?? 0, 0);
        }
        return { cashBalance, creditBalance };
    }, [rows]);
    const sortColumns = useMemo<SortColumn<ProviderBalanceRow>[]>(
        () => [
            { key: "vendor", value: (row) => row.vendor },
            { key: "creditBalanceUsd", value: (row) => row.creditBalanceUsd },
            {
                key: "creditDepletionDate",
                value: (row) => row.creditDepletionDate,
            },
            { key: "cashBalanceUsd", value: (row) => row.cashBalanceUsd },
        ],
        [],
    );
    const { headerProps, rows: sorted } = useSortableRows(rows, sortColumns);
    const toggle = (vendor: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(vendor)) next.delete(vendor);
            else next.add(vendor);
            return next;
        });
    };

    return (
        <div className="flex flex-col gap-4">
            <StatCards
                items={[
                    {
                        label: "Free credit",
                        value: fmtUsd(totals.creditBalance),
                    },
                    {
                        label: "Cash prepaid",
                        value: fmtUsd(totals.cashBalance),
                    },
                ]}
            />
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("vendor")}
                            >
                                Vendor
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Free credit
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("cashBalanceUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Latest complete OP Cloud balance snapshot. Without one, this falls back to cumulative prepaid payments minus cash-funded usage.",
                                        tables: "op_cloud_api + op_transactions_api",
                                        formula:
                                            "snapshot, else payments − cash usage",
                                    }}
                                >
                                    Cash prepaid
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                        <TableRow>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("creditBalanceUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Latest complete OP Cloud balance snapshot. Without one, this falls back to unexpired grants minus credit-funded usage.",
                                        tables: "op_cloud_api",
                                        formula:
                                            "snapshot, else grants − used − lapsed",
                                    }}
                                >
                                    Left
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("creditDepletionDate")}
                            >
                                <HeaderHint hint="Estimated credit depletion date, or the expiry date when unused credit expires first.">
                                    Runs out
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(sorted, (row) => row.vendor).map(
                            ({ key, row }) => {
                                const isExpanded = expanded.has(row.vendor);
                                return (
                                    <Fragment key={key}>
                                        <TableRow
                                            className={
                                                !isActiveBalanceRow(row)
                                                    ? "opacity-60"
                                                    : undefined
                                            }
                                        >
                                            <TableCell>
                                                <div className="flex items-center justify-between gap-3">
                                                    <button
                                                        type="button"
                                                        aria-expanded={
                                                            isExpanded
                                                        }
                                                        title={
                                                            row.balanceAsOf
                                                                ? `Balance checked ${fmtPeriod(row.balanceAsOf)}`
                                                                : "Calculated from ledger activity"
                                                        }
                                                        onClick={() =>
                                                            toggle(row.vendor)
                                                        }
                                                        className="inline-flex items-center gap-1.5 text-left hover:text-theme-text"
                                                    >
                                                        <span className="text-theme-text-soft">
                                                            {isExpanded
                                                                ? "▾"
                                                                : "▸"}
                                                        </span>
                                                        {row.vendor}
                                                    </button>
                                                    {providerAuditUrl(
                                                        row.vendor,
                                                    ) && (
                                                        <a
                                                            href={
                                                                providerAuditUrl(
                                                                    row.vendor,
                                                                ) ?? undefined
                                                            }
                                                            target="_blank"
                                                            rel="noreferrer noopener"
                                                            className="text-sm text-theme-accent underline decoration-dotted underline-offset-4"
                                                        >
                                                            Dashboard
                                                        </a>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                numeric
                                                className={GROUP_BORDER}
                                            >
                                                {optionalUsd(
                                                    row.creditBalanceUsd,
                                                )}
                                            </TableCell>
                                            <TableCell
                                                className={depletionTone(
                                                    row.creditDepletionDate,
                                                    now,
                                                )}
                                            >
                                                {row.creditDepletionDate
                                                    ? fmtPeriod(
                                                          row.creditDepletionDate,
                                                      )
                                                    : "–"}
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                numeric
                                                className={cn(
                                                    GROUP_BORDER,
                                                    balanceTone(
                                                        row.cashBalanceUsd,
                                                    ),
                                                )}
                                            >
                                                {optionalUsd(
                                                    row.cashBalanceUsd,
                                                )}
                                            </TableCell>
                                        </TableRow>
                                        {isExpanded && (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={4}
                                                    className="bg-theme-bg-active/40"
                                                >
                                                    <BalanceHistory row={row} />
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </Fragment>
                                );
                            },
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

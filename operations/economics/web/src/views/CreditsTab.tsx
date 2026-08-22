import {
    cn,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
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
import {
    providerAccountLabel,
    providerAuditTargets,
} from "../lib/providerRegistry";
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

function auditTargetLabel(
    vendor: string,
    target: ReturnType<typeof providerAuditTargets>[number],
    targetCount: number,
) {
    if (target.accountId) {
        return (
            providerAccountLabel(vendor, target.accountId) ?? target.accountId
        );
    }
    if (targetCount === 1) return "Dashboard";
    const hostname = new URL(target.url).hostname;
    if (hostname.includes("amazon.com")) return "AWS credits";
    if (hostname.includes("automat-it.com")) return "Glass";
    if (hostname.includes("umbrellacost.io")) return "Umbrella";
    return hostname.replace(/^www\./, "");
}

function VendorAccess({ vendor }: { vendor: string }) {
    const targets = providerAuditTargets(vendor);
    if (targets.length === 0) {
        return <span className="text-sm text-intent-danger-text">Missing</span>;
    }
    return (
        <div className="flex min-w-52 flex-col gap-1">
            {targets.map((target, index) => (
                <div
                    key={`${target.accountId ?? "default"}|${target.url}|${index}`}
                    className="flex flex-wrap items-baseline gap-x-2 text-sm"
                >
                    <a
                        href={target.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-theme-accent underline decoration-dotted underline-offset-4"
                    >
                        {auditTargetLabel(vendor, target, targets.length)}
                    </a>
                    <span
                        className={cn(
                            "text-theme-text-soft",
                            target.loginEmail == null &&
                                "text-intent-danger-text",
                        )}
                    >
                        {target.loginEmail ?? "login missing"}
                    </span>
                    {target.pending && (
                        <span className="text-xs text-intent-warning-text">
                            verify
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

function BalanceStatus({ row }: { row: ProviderBalanceRow }) {
    const status = row.balanceStatus;
    const label =
        status === "checked"
            ? row.balanceAsOf
                ? fmtPeriod(row.balanceAsOf)
                : "Checked"
            : status === "partial"
              ? `${row.checkedAccounts}/${row.expectedAccounts} accounts`
              : "Not checked";
    const hint =
        status === "checked"
            ? `Current balance snapshot checked${row.balanceAsOf ? ` on ${fmtPeriod(row.balanceAsOf)}` : ""}.`
            : status === "partial"
              ? `Only ${row.checkedAccounts} of ${row.expectedAccounts} active accounts have a same-day balance snapshot. Displayed balances sum the checked accounts only.`
              : "No current OP Cloud balance snapshot. Displayed balances are ledger estimates, not a verified account balance.";
    return (
        <Tooltip triggerAs="span" content={hint}>
            <span
                className={cn(
                    "whitespace-nowrap text-sm",
                    status === "checked"
                        ? "text-theme-text-soft"
                        : "text-intent-warning-text",
                )}
            >
                {label}
            </span>
        </Tooltip>
    );
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
        let checked = 0;
        for (const row of rows) {
            cashBalance += Math.max(row.cashBalanceUsd ?? 0, 0);
            creditBalance += Math.max(row.creditBalanceUsd ?? 0, 0);
            if (row.balanceStatus === "checked") checked += 1;
        }
        return { cashBalance, creditBalance, checked };
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
                        detail: `Known balance · ${totals.checked} of ${rows.length} vendors checked`,
                    },
                    {
                        label: "Cash prepaid",
                        value: fmtUsd(totals.cashBalance),
                        detail: `${rows.length - totals.checked} need attention`,
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
                            <TableHeaderCell rowSpan={2}>
                                Access
                            </TableHeaderCell>
                            <TableHeaderCell rowSpan={2}>
                                Balance checked
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
                                            "Latest OP Cloud balance snapshot. A partial multi-account row sums only the checked accounts. Without a snapshot, this falls back to cumulative prepaid payments minus cash-funded usage.",
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
                                            "Latest OP Cloud balance snapshot. A partial multi-account row sums only the checked accounts. Without a snapshot, this falls back to unexpired grants minus credit-funded usage.",
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
                                                <button
                                                    type="button"
                                                    aria-expanded={isExpanded}
                                                    onClick={() =>
                                                        toggle(row.vendor)
                                                    }
                                                    className="inline-flex items-center gap-1.5 text-left hover:text-theme-text"
                                                >
                                                    <span className="text-theme-text-soft">
                                                        {isExpanded ? "▾" : "▸"}
                                                    </span>
                                                    {row.vendor}
                                                </button>
                                            </TableCell>
                                            <TableCell>
                                                <VendorAccess
                                                    vendor={row.vendor}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <BalanceStatus row={row} />
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
                                                    colSpan={6}
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

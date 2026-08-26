import {
    Chip,
    cn,
    InlineLink,
    ScrollArea,
    TableBody,
    TableCell,
    TableDisclosureButton,
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
import {
    type ProviderBalanceRow,
    providerBalanceRows,
} from "../lib/providerBalances";
import type { Data } from "../types";

// Urgency color for a depletion date: red under 30 days, amber under 90.
export function depletionTone(date: string | null, now: Date): string {
    if (!date) return "text-theme-text-soft";
    const days = (Date.parse(date) - now.getTime()) / 86_400_000;
    if (days < 30) return "text-intent-danger-text";
    if (days < 90) return "text-intent-warning-text";
    return "text-theme-text-soft";
}

export function isActiveBalanceRow(row: Pick<ProviderBalanceRow, "active">) {
    return row.active;
}

export function needsBalanceAttention(
    row: Pick<
        ProviderBalanceRow,
        "active" | "balanceStatus" | "balanceTracking"
    >,
) {
    return row.active && row.balanceTracking && row.balanceStatus !== "checked";
}

function balanceTone(value: number | null) {
    return value != null && value < -0.005 ? "text-intent-danger-text" : "";
}

function optionalUsd(value: number | null) {
    return value == null ? "–" : fmtUsd(value);
}

function BalanceStatus({ row }: { row: ProviderBalanceRow }) {
    const status = row.balanceStatus;
    const needsAttention =
        status === "stale" || status === "partial" || status === "not_checked";
    const label =
        status === "not_applicable"
            ? "No balance"
            : status === "archived"
              ? row.balanceAsOf
                  ? fmtPeriod(row.balanceAsOf)
                  : "No snapshot"
              : status === "stale"
                ? row.balanceAsOf
                    ? fmtPeriod(row.balanceAsOf)
                    : "Stale"
                : status === "checked"
                  ? row.balanceAsOf
                      ? fmtPeriod(row.balanceAsOf)
                      : "Checked"
                  : status === "partial"
                    ? `${row.checkedAccounts}/${row.expectedAccounts} accounts`
                    : "Not checked";
    const hint =
        status === "not_applicable"
            ? "This vendor has no wallet, credit pool, or quota balance to refresh. Monthly usage and invoices are checked separately."
            : status === "archived"
              ? `This provider is inactive. Its last recorded balance${row.balanceAsOf ? ` is dated ${fmtPeriod(row.balanceAsOf)}` : " has no snapshot"}; no monthly refresh is required.`
              : status === "stale"
                ? `The last balance snapshot${row.balanceAsOf ? ` is dated ${fmtPeriod(row.balanceAsOf)}` : " is old"}. Refresh this active provider.`
                : status === "checked"
                  ? `Current balance snapshot checked${row.balanceAsOf ? ` on ${fmtPeriod(row.balanceAsOf)}` : ""}.`
                  : status === "partial"
                    ? `Only ${row.checkedAccounts} of ${row.expectedAccounts} active accounts have a same-day balance snapshot. Displayed balances sum the checked accounts only.`
                    : "No current OP Cloud balance snapshot. Displayed balances are ledger estimates, not a verified account balance.";
    const fullHint = row.balanceNote ? `${hint} ${row.balanceNote}.` : hint;
    return (
        <Tooltip triggerAs="span" content={fullHint}>
            <span className="flex flex-col whitespace-nowrap text-sm">
                <span
                    className={
                        needsAttention
                            ? "text-intent-warning-text"
                            : "text-theme-text-soft"
                    }
                >
                    {label}
                </span>
                {row.balanceNote && (
                    <span className="max-w-56 truncate text-xs text-theme-text-soft">
                        {row.balanceNote}
                    </span>
                )}
            </span>
        </Tooltip>
    );
}

function BalanceHistory({ row }: { row: ProviderBalanceRow }) {
    return (
        <ScrollArea axis="x" className="p-2 pb-3">
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
        </ScrollArea>
    );
}

export function BalancesTab({ data }: { data: Data }) {
    const now = useMemo(() => new Date(), []);
    const rows = useMemo(() => providerBalanceRows(data, now), [data, now]);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const totals = useMemo(() => {
        let cashBalance = 0;
        let creditBalance = 0;
        let active = 0;
        let checked = 0;
        let attention = 0;
        for (const row of rows) {
            if (!row.active) continue;
            cashBalance += Math.max(row.cashBalanceUsd ?? 0, 0);
            creditBalance += Math.max(row.creditBalanceUsd ?? 0, 0);
            if (!row.balanceTracking) continue;
            active += 1;
            if (row.balanceStatus === "checked") checked += 1;
            if (needsBalanceAttention(row)) attention += 1;
        }
        return { cashBalance, creditBalance, active, checked, attention };
    }, [rows]);
    const sortColumns = useMemo<SortColumn<ProviderBalanceRow>[]>(
        () => [
            { key: "vendor", value: (row) => row.vendor },
            { key: "active", value: (row) => Number(row.active) },
            {
                key: "collectionMethod",
                value: (row) => row.collectionMethod,
            },
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
                        detail: `Active providers · ${totals.checked} of ${totals.active} tracked balances checked`,
                    },
                    {
                        label: "Cash prepaid",
                        value: fmtUsd(totals.cashBalance),
                        detail: `${totals.attention} active balance${totals.attention === 1 ? "" : "s"} need${totals.attention === 1 ? "s" : ""} attention`,
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
                                rowSpan={2}
                                {...headerProps("active")}
                            >
                                Status
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("collectionMethod")}
                            >
                                Collection
                            </TableHeaderCell>
                            <TableHeaderCell rowSpan={2}>
                                Access
                            </TableHeaderCell>
                            <TableHeaderCell rowSpan={2}>
                                Last checked
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
                                            "Latest dated Compute ledger balance snapshot. Inactive vendors keep their last known snapshot. A partial multi-account row sums only checked accounts.",
                                        tables: "economics_compute_ledger_api",
                                        formula: "latest balance snapshot",
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
                                            "Latest dated Compute ledger balance snapshot. Inactive vendors keep their last known snapshot. A partial multi-account row sums only checked accounts.",
                                        tables: "economics_compute_ledger_api",
                                        formula: "latest balance snapshot",
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
                                                <TableDisclosureButton
                                                    expanded={isExpanded}
                                                    onClick={() =>
                                                        toggle(row.vendor)
                                                    }
                                                >
                                                    {row.label}
                                                </TableDisclosureButton>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    intent={
                                                        row.active
                                                            ? "success"
                                                            : "neutral"
                                                    }
                                                    size="sm"
                                                >
                                                    {row.active
                                                        ? "active"
                                                        : "inactive"}
                                                </Chip>
                                            </TableCell>
                                            <TableCell className="uppercase text-xs text-theme-text-soft">
                                                {row.collectionMethod ?? "–"}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    {row.access.length === 0
                                                        ? "–"
                                                        : row.access.map(
                                                              (
                                                                  target,
                                                                  index,
                                                              ) => {
                                                                  const account =
                                                                      target.accountId;
                                                                  const label =
                                                                      account ??
                                                                      (row
                                                                          .access
                                                                          .length >
                                                                      1
                                                                          ? new URL(
                                                                                target.url,
                                                                            ).hostname.split(
                                                                                ".",
                                                                            )[0]
                                                                          : target.workspace);
                                                                  return (
                                                                      <InlineLink
                                                                          key={`${target.url}|${account ?? index}`}
                                                                          href={
                                                                              target.url
                                                                          }
                                                                          className="text-xs"
                                                                      >
                                                                          {
                                                                              label
                                                                          }
                                                                      </InlineLink>
                                                                  );
                                                              },
                                                          )}
                                                </div>
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
                                                    colSpan={8}
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

import {
    Chip,
    InlineLink,
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
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { useAmountDisplay } from "../components/ReconcilePro";
import { StatCards } from "../components/StatCards";
import { fmtPeriod } from "../lib/format";
import {
    type ProviderAccountBalanceRow,
    providerAccountBalanceRows,
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

export function isActiveBalanceRow(
    row: Pick<ProviderAccountBalanceRow, "active">,
) {
    return row.active;
}

export function needsBalanceAttention(
    row: Pick<
        ProviderAccountBalanceRow,
        "active" | "balanceStatus" | "balanceTracking"
    >,
) {
    return row.active && row.balanceTracking && row.balanceStatus !== "checked";
}

function balanceTone(value: number | null) {
    return value != null && value < -0.005 ? "text-intent-danger-text" : "";
}

export function BalancesTab({ data }: { data: Data }) {
    const { fmtUsd } = useAmountDisplay();
    const now = useMemo(() => new Date(), []);
    const rows = useMemo(
        () => providerAccountBalanceRows(data, now),
        [data, now],
    );
    const totals = useMemo(() => {
        let cashBalance = 0;
        let creditBalance = 0;
        for (const row of rows) {
            if (!row.active) continue;
            cashBalance += Math.max(row.cashBalanceUsd ?? 0, 0);
            creditBalance += Math.max(row.creditBalanceUsd ?? 0, 0);
        }
        return { cashBalance, creditBalance };
    }, [rows]);
    const sortColumns = useMemo<SortColumn<ProviderAccountBalanceRow>[]>(
        () => [
            { key: "vendor", value: (row) => row.vendor },
            { key: "account", value: (row) => row.accountLabel },
            { key: "login", value: (row) => row.loginEmail },
            { key: "active", value: (row) => Number(row.active) },
            {
                key: "collectionMethod",
                value: (row) => row.collectionMethod,
            },
            { key: "balanceAsOf", value: (row) => row.balanceAsOf },
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

    return (
        <div className="flex flex-col gap-4">
            <StatCards
                items={[
                    {
                        label: "Free credit",
                        value: fmtUsd(totals.creditBalance),
                        detail: "Recorded active-account balances",
                    },
                    {
                        label: "Cash prepaid",
                        value: fmtUsd(totals.cashBalance),
                        detail: "Recorded active-account balances",
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
                                {...headerProps("account")}
                            >
                                Account
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("login")}
                            >
                                Login
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
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("balanceAsOf")}
                            >
                                Last checked
                            </TableHeaderCell>
                            <TableHeaderCell colSpan={2} align="center">
                                Free credit
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                align="right"
                                {...headerProps("cashBalanceUsd")}
                            >
                                Cash prepaid
                            </TableHeaderCell>
                        </TableRow>
                        <TableRow>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("creditBalanceUsd")}
                            >
                                Left
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("creditDepletionDate")}
                                title="Projection from checked balances; unknown when evidence is missing or the balance lasts beyond ten years."
                            >
                                Projected end
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            sorted,
                            (row) => `${row.vendor}|${row.accountId}`,
                        ).map(({ key, row }) => (
                            <TableRow
                                key={key}
                                className={
                                    !isActiveBalanceRow(row)
                                        ? "opacity-60"
                                        : undefined
                                }
                            >
                                <TableCell>{row.label}</TableCell>
                                <TableCell>
                                    <Tooltip
                                        triggerAs="span"
                                        content={row.accountId}
                                    >
                                        <span>{row.accountLabel}</span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-xs text-theme-text-soft">
                                    {row.loginEmail ?? "–"}
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        intent={
                                            row.active ? "success" : "neutral"
                                        }
                                        size="sm"
                                    >
                                        {row.active ? "active" : "inactive"}
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
                                                  (target, index) => (
                                                      <InlineLink
                                                          key={`${target.url}|${index}`}
                                                          href={target.url}
                                                          className="text-xs"
                                                      >
                                                          {target.label ??
                                                              (row.access
                                                                  .length > 1
                                                                  ? new URL(
                                                                        target.url,
                                                                    ).hostname.split(
                                                                        ".",
                                                                    )[0]
                                                                  : "Open")}
                                                      </InlineLink>
                                                  ),
                                              )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {row.balanceAsOf
                                        ? fmtPeriod(row.balanceAsOf)
                                        : "–"}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(row.creditBalanceUsd)}
                                </TableCell>
                                <TableCell
                                    className={depletionTone(
                                        row.creditDepletionDate,
                                        now,
                                    )}
                                >
                                    <span>
                                        {row.creditDepletionDate
                                            ? new Date(
                                                  `${row.creditDepletionDate}T12:00:00Z`,
                                              ).toLocaleDateString("en-US", {
                                                  month: "short",
                                                  day: "numeric",
                                                  year: "numeric",
                                                  timeZone: "UTC",
                                              })
                                            : "–"}
                                    </span>
                                    {row.expiryAssumed && (
                                        <span className="block text-xs text-theme-text-muted">
                                            Expiry ignored by agreement
                                        </span>
                                    )}
                                    {!row.creditTermsKnown &&
                                        !row.expiryAssumed &&
                                        (row.creditBalanceUsd ?? 0) > 0 && (
                                            <span className="block text-xs text-theme-text-muted">
                                                Expiry unverified
                                            </span>
                                        )}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    numeric
                                    className={balanceTone(row.cashBalanceUsd)}
                                >
                                    {fmtUsd(row.cashBalanceUsd)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

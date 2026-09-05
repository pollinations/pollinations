import {
    Chip,
    cn,
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

function optionalUsd(value: number | null) {
    return value == null ? "–" : fmtUsd(value);
}

function BalanceStatus({ row }: { row: ProviderAccountBalanceRow }) {
    const status = row.balanceStatus;
    const needsAttention = status === "stale" || status === "not_checked";
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
                  : "No current Compute ledger balance snapshot exists for this account.";
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

export function BalancesTab({ data }: { data: Data }) {
    const now = useMemo(() => new Date(), []);
    const rows = useMemo(
        () => providerAccountBalanceRows(data, now),
        [data, now],
    );
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
                        detail: `Active accounts · ${totals.checked} of ${totals.active} tracked balances checked`,
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
                                            "Latest dated Compute ledger balance snapshot for this account. Inactive accounts keep their last known snapshot.",
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
                                            "Latest dated Compute ledger balance snapshot for this account. Inactive accounts keep their last known snapshot.",
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
                                    <BalanceStatus row={row} />
                                </TableCell>
                                <TableCell
                                    align="right"
                                    numeric
                                    className={GROUP_BORDER}
                                >
                                    {optionalUsd(row.creditBalanceUsd)}
                                </TableCell>
                                <TableCell
                                    className={depletionTone(
                                        row.creditDepletionDate,
                                        now,
                                    )}
                                >
                                    <Tooltip
                                        triggerAs="span"
                                        content={
                                            row.creditDepletionReason ===
                                            "expiry"
                                                ? "Next verified credit expiry; only the lots expiring on this date lapse. Other lots keep their own dates."
                                                : row.expiryAssumed
                                                  ? "User-approved planning assumption: consume this balance before any expiry. Provider non-expiry is not verified."
                                                  : row.creditTermsKnown
                                                    ? "Estimated from recent usage; not a contractual expiry."
                                                    : "Credit expiry has not been verified. No exhaustion date is guaranteed."
                                        }
                                    >
                                        <span>
                                            {row.creditDepletionDate
                                                ? new Date(
                                                      `${row.creditDepletionDate}T12:00:00Z`,
                                                  ).toLocaleDateString(
                                                      "en-US",
                                                      {
                                                          month: "short",
                                                          day: "numeric",
                                                          year: "numeric",
                                                          timeZone: "UTC",
                                                      },
                                                  )
                                                : (row.creditBalanceUsd ?? 0) >
                                                        0 &&
                                                    !row.creditTermsKnown
                                                  ? row.expiryAssumed
                                                      ? "Assumed"
                                                      : "Unverified"
                                                  : "–"}
                                        </span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell
                                    align="right"
                                    numeric
                                    className={cn(
                                        GROUP_BORDER,
                                        balanceTone(row.cashBalanceUsd),
                                    )}
                                >
                                    {optionalUsd(row.cashBalanceUsd)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

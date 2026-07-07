import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { fmtPeriod } from "../lib/format";
import { toUsd } from "../lib/fx";
import { monthShift } from "../lib/insights";
import { matchesMonth } from "../lib/months";
import type { Data, ProviderMonthlyRow, TransactionRow } from "../types";

function transactionKey(row: TransactionRow) {
    return [
        row.date,
        row.vendor,
        row.category,
        row.charged_amount,
        row.charged_currency,
    ].join("|");
}

export type ProviderMatch = "match" | "miss" | null;

// A compute charge is provider-matched when a provider paid row for the same
// vendor, in the charge month or the month before (arrears billers settle
// last month's usage), carries the same amount — exact to the cent in the
// same currency, within 2.5% across currencies (monthly-average FX drifts
// against the charge's daily rate). Non-compute rows get no badge.
export function providerMatchFor(
    row: TransactionRow,
    providerRows: ProviderMonthlyRow[],
): ProviderMatch {
    if (row.category !== "compute") return null;
    const txMonth = row.date.slice(0, 7);
    const months = new Set([txMonth, monthShift(txMonth, -1)]);
    for (const provider of providerRows) {
        if (provider.vendor !== row.vendor) continue;
        if (!months.has(provider.month) || provider.paid <= 0) continue;
        if (provider.currency === row.charged_currency) {
            if (Math.abs(provider.paid - row.charged_amount) <= 0.01) {
                return "match";
            }
            continue;
        }
        const chargedUsd = toUsd(
            row.charged_amount,
            row.charged_currency,
            txMonth,
        );
        const paidUsd = toUsd(provider.paid, provider.currency, provider.month);
        if (
            chargedUsd > 0 &&
            Math.abs(paidUsd - chargedUsd) / chargedUsd <= 0.025
        ) {
            return "match";
        }
    }
    return "miss";
}

function ProviderMatchChip({ match }: { match: ProviderMatch }) {
    if (match === "match") {
        return (
            <span title="a provider paid row (same or previous month) matches this charge">
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    provider ✓
                </Chip>
            </span>
        );
    }
    if (match === "miss") {
        return (
            <span title="no provider paid row matches this amount in the charge month or the month before — the provider plane is missing this spend (or the meter disagrees with the bank)">
                <Chip intent="danger" size="sm">
                    no provider
                </Chip>
            </span>
        );
    }
    return null;
}

export function TransactionsTab({
    category = "all",
    data,
    month = "",
    vendor = "all",
}: {
    category?: string;
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const baseRows = useMemo(
        () =>
            data.transactions.filter(
                (row) =>
                    matchesMonth(row.date, month) &&
                    (vendor === "all" || row.vendor === vendor) &&
                    (category === "all" || row.category === category),
            ),
        [data.transactions, month, vendor, category],
    );
    const sortColumns = useMemo<SortColumn<TransactionRow>[]>(
        () => [
            { key: "date", value: (row) => row.date },
            { key: "vendor", value: (row) => row.vendor },
            { key: "category", value: (row) => row.category },
            {
                key: "charged_amount",
                value: (row) => row.charged_amount,
            },
            {
                key: "charged_currency",
                value: (row) => row.charged_currency,
            },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "date",
        direction: "desc",
    });

    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("date")}>
                            date
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("vendor")}>
                            vendor
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("category")}>
                            category
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("charged_amount")}>
                            charged_amount
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("charged_currency")}>
                            charged_currency
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, transactionKey).map(
                        ({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{fmtPeriod(row.date)}</TableCell>
                                <TableCell>
                                    {row.vendor || (
                                        <span title="no vendor match — add an alias in forager config/vendor_aliases.json and re-run the ingest">
                                            <Chip intent="warning" size="sm">
                                                unmatched
                                            </Chip>
                                        </span>
                                    )}
                                </TableCell>
                                <TableCell>{row.category}</TableCell>
                                <TableCell>
                                    <span className="inline-flex items-center gap-2">
                                        {row.charged_amount}
                                        <ProviderMatchChip
                                            match={providerMatchFor(
                                                row,
                                                data.providerMonthly,
                                            )}
                                        />
                                    </span>
                                </TableCell>
                                <TableCell>{row.charged_currency}</TableCell>
                            </TableRow>
                        ),
                    )}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

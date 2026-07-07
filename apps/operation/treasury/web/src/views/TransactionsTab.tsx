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
import { isYearFilter, matchesMonth } from "../lib/months";
import type { Data, TransactionRow } from "../types";

function transactionKey(row: TransactionRow) {
    return [
        row.date,
        row.vendor,
        row.category,
        row.charged_amount,
        row.charged_currency,
    ].join("|");
}

export function aggregateTransactionsByYear({
    category,
    rows,
    vendor,
    year,
}: {
    category: string;
    rows: TransactionRow[];
    vendor: string;
    year: string;
}): TransactionRow[] {
    const byKey = new Map<string, TransactionRow>();
    for (const row of rows) {
        if (!matchesMonth(row.date, year)) continue;
        if (vendor !== "all" && row.vendor !== vendor) continue;
        if (category !== "all" && row.category !== category) continue;

        const key = `${row.vendor}|${row.category}|${row.charged_currency}`;
        const entry = byKey.get(key) ?? {
            date: year,
            vendor: row.vendor,
            category: row.category,
            charged_amount: 0,
            charged_currency: row.charged_currency,
        };
        entry.charged_amount += row.charged_amount;
        byKey.set(key, entry);
    }
    return [...byKey.values()].sort(
        (a, b) =>
            a.vendor.localeCompare(b.vendor) ||
            a.category.localeCompare(b.category) ||
            a.charged_currency.localeCompare(b.charged_currency),
    );
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
    const baseRows = useMemo(() => {
        if (isYearFilter(month)) {
            return aggregateTransactionsByYear({
                category,
                rows: data.transactions,
                vendor,
                year: month,
            });
        }
        return data.transactions.filter(
            (row) =>
                matchesMonth(row.date, month) &&
                (vendor === "all" || row.vendor === vendor) &&
                (category === "all" || row.category === category),
        );
    }, [data.transactions, month, vendor, category]);
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
                                <TableCell>{row.charged_amount}</TableCell>
                                <TableCell>{row.charged_currency}</TableCell>
                            </TableRow>
                        ),
                    )}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

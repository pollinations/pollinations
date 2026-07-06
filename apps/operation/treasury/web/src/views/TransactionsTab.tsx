import {
    ExternalLinkButton,
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
import { matchesMonth } from "../lib/months";
import type { Data, TransactionRow } from "../types";

function transactionKey(row: TransactionRow) {
    return [
        row.date,
        row.vendor,
        row.category,
        row.charged_amount,
        row.charged_currency,
        row.paid_amount,
        row.paid_currency,
        row.invoice_ref,
        row.match_status,
    ].join("|");
}

function InvoiceRef({ value }: { value: string }) {
    if (!value) return <span>-</span>;

    return (
        <ExternalLinkButton
            href={`/api/files/invoice?path=${encodeURIComponent(value)}`}
            size="sm"
            title={value}
        >
            invoice
        </ExternalLinkButton>
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
            { key: "paid_amount", value: (row) => row.paid_amount },
            {
                key: "paid_currency",
                value: (row) => row.paid_currency,
            },
            { key: "match_status", value: (row) => row.match_status },
            { key: "invoice_ref", value: (row) => row.invoice_ref },
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
                        <TableHeaderCell {...headerProps("paid_amount")}>
                            paid_amount
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("paid_currency")}>
                            paid_currency
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("match_status")}>
                            match_status
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("invoice_ref")}>
                            invoice_ref
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, transactionKey).map(
                        ({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{fmtPeriod(row.date)}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{row.category}</TableCell>
                                <TableCell>{row.charged_amount}</TableCell>
                                <TableCell>{row.charged_currency}</TableCell>
                                <TableCell>{row.paid_amount}</TableCell>
                                <TableCell>{row.paid_currency}</TableCell>
                                <TableCell>{row.match_status}</TableCell>
                                <TableCell>
                                    <InvoiceRef value={row.invoice_ref} />
                                </TableCell>
                            </TableRow>
                        ),
                    )}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

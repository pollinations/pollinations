import {
    ExternalLinkIcon,
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
        row.provider,
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
        <a
            href={`/api/files/invoice?path=${encodeURIComponent(value)}`}
            target="_blank"
            rel="noreferrer"
            title={value}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-theme-border/70 bg-theme-bg/60 px-2.5 text-sm font-medium text-theme-text-soft transition-colors hover:bg-theme-bg-hover hover:text-theme-text-strong"
        >
            invoice
            <ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
    );
}

export function TransactionsTab({
    category = "all",
    data,
    month = "",
    provider = "all",
}: {
    category?: string;
    data: Data;
    month?: string;
    provider?: string;
}) {
    const baseRows = useMemo(
        () =>
            data.transactions.filter(
                (row) =>
                    matchesMonth(row.date, month) &&
                    (provider === "all" || row.provider === provider) &&
                    (category === "all" || row.category === category),
            ),
        [data.transactions, month, provider, category],
    );
    const sortColumns = useMemo<SortColumn<TransactionRow>[]>(
        () => [
            { key: "date", value: (row) => row.date },
            { key: "provider", value: (row) => row.provider },
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
                        <TableHeaderCell {...headerProps("provider")}>
                            provider
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
                                <TableCell>{row.provider}</TableCell>
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

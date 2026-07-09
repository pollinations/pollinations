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
    RAW_OP_STICKY_HEADER,
    RawOpTableScroller,
    type SortColumn,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { SourceCell } from "../components/Provenance";
import { fmtNumber, fmtUtcDateTime, utcDateTimeTitle } from "../lib/format";
import { matchesMonth } from "../lib/months";
import type { Data, OpTransactionRow } from "../types";

function opTransactionKey(row: OpTransactionRow) {
    return [
        row.date,
        row.source,
        row.vendor,
        row.category,
        row.amount,
        row.currency,
        row.description,
    ].join("|");
}

export function OpTransactionsTab({
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
        return (data.opTransactions ?? []).filter(
            (row) =>
                matchesMonth(row.date, month) &&
                (vendor === "all" || row.vendor === vendor) &&
                (category === "all" || row.category === category),
        );
    }, [data.opTransactions, month, vendor, category]);
    const sortColumns = useMemo<SortColumn<OpTransactionRow>[]>(
        () => [
            { key: "source", value: (row) => row.source },
            { key: "date", value: (row) => row.date },
            { key: "vendor", value: (row) => row.vendor },
            { key: "category", value: (row) => row.category },
            { key: "amount", value: (row) => row.amount },
            { key: "currency", value: (row) => row.currency },
            { key: "description", value: (row) => row.description },
            { key: "evidence", value: (row) => row.evidence },
            { key: "recorded_at", value: (row) => row.recorded_at },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "date",
        direction: "desc",
    });

    return (
        <RawOpTableScroller>
            <DataTable className={RAW_OP_STICKY_HEADER}>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("source")}>
                            source
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("date")}>
                            date
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("vendor")}>
                            vendor
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("category")}>
                            category
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("amount")}>
                            amount
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            currency
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("description")}>
                            description
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("evidence")}>
                            evidence
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("recorded_at")}>
                            recorded_at
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, opTransactionKey).map(
                        ({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>
                                    <SourceCell sources={[row.source]} />
                                </TableCell>
                                <TableCell>{row.date}</TableCell>
                                <TableCell>
                                    {row.vendor || (
                                        <Chip intent="warning" size="sm">
                                            unmatched
                                        </Chip>
                                    )}
                                </TableCell>
                                <TableCell>{row.category}</TableCell>
                                <TableCell>{fmtNumber(row.amount)}</TableCell>
                                <TableCell>{row.currency}</TableCell>
                                <TableCell>{row.description}</TableCell>
                                <TableCell>{row.evidence}</TableCell>
                                <TableCell
                                    className="whitespace-nowrap"
                                    title={utcDateTimeTitle(row.recorded_at)}
                                >
                                    {fmtUtcDateTime(row.recorded_at)}
                                </TableCell>
                            </TableRow>
                        ),
                    )}
                </TableBody>
            </DataTable>
        </RawOpTableScroller>
    );
}

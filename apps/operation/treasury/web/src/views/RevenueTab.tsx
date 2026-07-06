import {
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
import { SourceCell } from "../components/Provenance";
import { fmtPeriod } from "../lib/format";
import type { Data, RevenueMonthlyRow } from "../types";

export function RevenueTab({ data }: { data: Data }) {
    const sortColumns = useMemo<SortColumn<RevenueMonthlyRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "source", value: (row) => row.source },
            { key: "currency", value: (row) => row.currency },
            { key: "gross_amount", value: (row) => row.gross_amount },
            { key: "fees_amount", value: (row) => row.fees_amount },
            { key: "refunds_amount", value: (row) => row.refunds_amount },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(
        data.revenueMonthly,
        sortColumns,
        {
            key: "month",
            direction: "desc",
        },
    );

    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("month")}>
                            month
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("source")}>
                            source
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            currency
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("gross_amount")}>
                            gross_amount
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("fees_amount")}>
                            fees_amount
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("refunds_amount")}>
                            refunds_amount
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        rows,
                        (row) => `${row.month}|${row.currency}`,
                    ).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell>{fmtPeriod(row.month)}</TableCell>
                            <TableCell>
                                <SourceCell sources={[row.source]} />
                            </TableCell>
                            <TableCell>{row.currency}</TableCell>
                            <TableCell>{row.gross_amount}</TableCell>
                            <TableCell>{row.fees_amount}</TableCell>
                            <TableCell>{row.refunds_amount}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

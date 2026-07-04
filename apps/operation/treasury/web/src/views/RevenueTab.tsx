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
import { fmtMoney, fmtPeriod } from "../lib/format";
import type { Data, RevenueMonthlyRow } from "../types";

export function RevenueTab({ data }: { data: Data }) {
    const sortColumns = useMemo<SortColumn<RevenueMonthlyRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "gross_eur", value: (row) => row.gross_eur },
            { key: "fees_eur", value: (row) => row.fees_eur },
            { key: "refunds_eur", value: (row) => row.refunds_eur },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(
        data.revenueMonthly,
        sortColumns,
    );

    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("month")}>
                            time period
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("gross_eur")}>
                            gross_eur
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("fees_eur")}>
                            fees_eur
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("refunds_eur")}>
                            refunds_eur
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, (row) => row.month).map(
                        ({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{fmtPeriod(row.month)}</TableCell>
                                <TableCell>
                                    {fmtMoney(row.gross_eur, "EUR")}
                                </TableCell>
                                <TableCell>
                                    {fmtMoney(row.fees_eur, "EUR")}
                                </TableCell>
                                <TableCell>
                                    {fmtMoney(row.refunds_eur, "EUR")}
                                </TableCell>
                            </TableRow>
                        ),
                    )}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

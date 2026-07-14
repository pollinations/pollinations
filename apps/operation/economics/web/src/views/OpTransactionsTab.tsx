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
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { fmtNumber } from "../lib/format";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
} from "../lib/months";
import type { Data, OpTransactionRow } from "../types";

export function OpTransactionsTab({
    category = [],
    data,
    month = "",
    vendor = "all",
}: {
    category?: ValueFilter;
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const baseRows = useMemo(() => {
        return (data.opTransactions ?? []).filter(
            (row) =>
                matchesMonth(row.date, month) &&
                matchesValue(row.vendor, vendor) &&
                matchesValue(row.category, category),
        );
    }, [data.opTransactions, month, vendor, category]);
    const sortColumns = useMemo<SortColumn<OpTransactionRow>[]>(
        () => [
            { key: "date", value: (row) => row.date },
            { key: "vendor", value: (row) => row.vendor },
            { key: "category", value: (row) => row.category },
            { key: "amount", value: (row) => row.amount },
            { key: "currency", value: (row) => row.currency },
            { key: "description", value: (row) => row.description },
            { key: "evidence", value: (row) => row.evidence },
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
                        <TableHeaderCell colSpan={3} align="center">
                            Transaction
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Cash
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Evidence
                        </TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell {...headerProps("date")}>
                            Date
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("vendor")}>
                            Vendor
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("category")}>
                            Category
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("amount")}
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Signed Wise cash movement. Revenue/inflows are positive; spend/outflows are negative.",
                                    tables: "op_transactions_api",
                                    sources: "WISE",
                                }}
                            >
                                Amount
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            Currency
                        </TableHeaderCell>
                        <TableHeaderCell
                            className={GROUP_BORDER}
                            {...headerProps("description")}
                        >
                            Description
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("evidence")}>
                            Evidence
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, (row) => row.entry_id).map(
                        ({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{row.date}</TableCell>
                                <TableCell>
                                    {row.vendor || (
                                        <Chip intent="warning" size="sm">
                                            unmatched
                                        </Chip>
                                    )}
                                </TableCell>
                                <TableCell>{row.category}</TableCell>
                                <TableCell
                                    align="right"
                                    className={GROUP_BORDER}
                                >
                                    {fmtNumber(row.amount)}
                                </TableCell>
                                <TableCell>{row.currency}</TableCell>
                                <TableCell className={GROUP_BORDER}>
                                    {row.description}
                                </TableCell>
                                <TableCell>{row.evidence}</TableCell>
                            </TableRow>
                        ),
                    )}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

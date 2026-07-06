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
import { matchesMonth } from "../lib/months";
import type { Data, MeterMonthlyRow } from "../types";

export function visibleMeterRows({
    meterRows,
    month,
    provider,
}: {
    meterRows: MeterMonthlyRow[];
    month: string;
    provider: string;
}) {
    return meterRows.filter(
        (row) =>
            matchesMonth(row.month, month) &&
            (provider === "all" || row.provider === provider),
    );
}

export function MeterTab({
    data,
    month = "",
    provider = "all",
}: {
    data: Data;
    month?: string;
    provider?: string;
}) {
    const baseRows = useMemo(
        () =>
            visibleMeterRows({
                meterRows: data.meterMonthly,
                month,
                provider,
            }),
        [data.meterMonthly, month, provider],
    );
    const sortColumns = useMemo<SortColumn<MeterMonthlyRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "source", value: (row) => row.source },
            { key: "provider", value: (row) => row.provider },
            { key: "credit", value: (row) => row.credit },
            { key: "paid", value: (row) => row.paid },
            { key: "currency", value: (row) => row.currency },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "month",
        direction: "desc",
    });
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
                        <TableHeaderCell {...headerProps("provider")}>
                            provider
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("credit")}>
                            credit
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("paid")}>
                            paid
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            currency
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        rows,
                        (row) =>
                            `${row.month}|${row.provider}|${row.source}|${row.currency}|${row.credit}|${row.paid}`,
                    ).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell>{fmtPeriod(row.month)}</TableCell>
                            <TableCell>
                                <SourceCell sources={[row.source]} />
                            </TableCell>
                            <TableCell>{row.provider}</TableCell>
                            <TableCell>{row.credit}</TableCell>
                            <TableCell>{row.paid}</TableCell>
                            <TableCell>{row.currency}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

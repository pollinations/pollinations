import {
    Alert,
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
import { fmtNumber } from "../lib/format";
import { matchesMonth } from "../lib/months";
import type { Data, GpuBillingRow } from "../types";

export function visibleBillingRows({
    billingRows,
    month,
    vendor,
}: {
    billingRows: GpuBillingRow[];
    month: string;
    vendor: string;
}) {
    return billingRows.filter(
        (row) =>
            matchesMonth(row.month, month) &&
            (vendor === "all" || row.vendor === vendor),
    );
}

export function billingEmptyNotice(
    billingRows: GpuBillingRow[],
    visibleRows: GpuBillingRow[],
): string | null {
    if (billingRows.length === 0) {
        return "No billing rows ingested yet — run python3 -m ingest.run --only billing";
    }
    if (visibleRows.length === 0) {
        const months = billingRows.map((r) => r.month).sort();
        const minMonth = months[0];
        const maxMonth = months[months.length - 1];
        const rowCount = billingRows.length;
        return `No billing rows match this period — billing data exists from ${minMonth} to ${maxMonth} (${rowCount} rows). Switch the period filter.`;
    }
    return null;
}

export function BillingTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const baseRows = useMemo(
        () =>
            visibleBillingRows({ billingRows: data.gpuBilling, month, vendor }),
        [data.gpuBilling, month, vendor],
    );
    const sortColumns = useMemo<SortColumn<GpuBillingRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "vendor", value: (row) => row.vendor },
            { key: "deployment", value: (row) => row.deployment },
            { key: "gpu", value: (row) => row.gpu },
            { key: "amount", value: (row) => row.amount },
            { key: "currency", value: (row) => row.currency },
            { key: "source", value: (row) => row.source },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "month",
        direction: "desc",
    });

    const notice = billingEmptyNotice(data.gpuBilling, baseRows);

    return (
        <>
            {notice && <Alert intent="warning">{notice}</Alert>}
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("month")}>
                                month
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("vendor")}>
                                vendor
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("deployment")}>
                                deployment
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("gpu")}>
                                gpu
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("amount")}>
                                amount
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("currency")}>
                                currency
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("source")}>
                                source
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) =>
                                `${row.month}|${row.vendor}|${row.deployment}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{row.month}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{row.deployment || "–"}</TableCell>
                                <TableCell>{row.gpu || "–"}</TableCell>
                                <TableCell className="text-right">
                                    {fmtNumber(row.amount)}
                                </TableCell>
                                <TableCell>{row.currency}</TableCell>
                                <TableCell>{row.source}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </>
    );
}

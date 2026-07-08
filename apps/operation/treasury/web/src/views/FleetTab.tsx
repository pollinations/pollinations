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
import { fmtNumber, fmtUsd } from "../lib/format";
import { matchesMonth } from "../lib/months";
import type { Data, GpuFleetRow } from "../types";

export function visibleFleetRows({
    fleetRows,
    month,
    vendor,
}: {
    fleetRows: GpuFleetRow[];
    month: string;
    vendor: string;
}) {
    return fleetRows.filter(
        (row) =>
            matchesMonth(row.recorded_at.slice(0, 7), month) &&
            (vendor === "all" || row.vendor === vendor),
    );
}

export function FleetTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const baseRows = useMemo(
        () => visibleFleetRows({ fleetRows: data.gpuFleet, month, vendor }),
        [data.gpuFleet, month, vendor],
    );
    const sortColumns = useMemo<SortColumn<GpuFleetRow>[]>(
        () => [
            { key: "recorded at", value: (row) => row.recorded_at },
            { key: "vendor", value: (row) => row.vendor },
            { key: "deployment", value: (row) => row.deployment },
            { key: "gpu", value: (row) => row.gpu },
            { key: "count", value: (row) => row.gpu_count },
            { key: "$/hr", value: (row) => row.usd_per_hr },
            { key: "balance", value: (row) => row.balance_usd ?? -Infinity },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "recorded at",
        direction: "desc",
    });

    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("recorded at")}>
                            recorded at
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
                        <TableHeaderCell {...headerProps("count")}>
                            count
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("$/hr")}>
                            $/hr
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("balance")}>
                            balance
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        rows,
                        (row) =>
                            `${row.recorded_at}|${row.vendor}|${row.deployment}`,
                    ).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell>{row.recorded_at}</TableCell>
                            <TableCell>{row.vendor}</TableCell>
                            <TableCell>{row.deployment}</TableCell>
                            <TableCell>{row.gpu}</TableCell>
                            <TableCell>{row.gpu_count}</TableCell>
                            <TableCell>{fmtNumber(row.usd_per_hr)}</TableCell>
                            <TableCell>
                                {row.balance_usd === null
                                    ? "–"
                                    : fmtUsd(row.balance_usd)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

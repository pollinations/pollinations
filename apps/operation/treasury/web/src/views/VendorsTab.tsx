import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { fmtPct, fmtUsd } from "../lib/format";
import { type VendorPlanes, vendorPlanes } from "../lib/insights";
import { matchesMonth, monthLabel } from "../lib/months";
import type { Data } from "../types";

const DELTA_ALARM_PCT = 25;

export function visiblePlaneRows({
    month,
    rows,
    vendor,
}: {
    month: string;
    rows: VendorPlanes[];
    vendor: string;
}) {
    return rows.filter(
        (row) =>
            matchesMonth(row.month, month) &&
            (vendor === "all" || row.vendor === vendor),
    );
}

export function VendorsTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const allRows = useMemo(() => vendorPlanes(data), [data]);
    const baseRows = useMemo(
        () => visiblePlaneRows({ rows: allRows, month, vendor }),
        [allRows, month, vendor],
    );
    const sortColumns = useMemo<SortColumn<VendorPlanes>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "vendor", value: (row) => row.vendor },
            { key: "paidUsd", value: (row) => row.paidUsd },
            { key: "spentUsd", value: (row) => row.spentUsd },
            { key: "creditUsd", value: (row) => row.creditUsd },
            { key: "registeredUsd", value: (row) => row.registeredUsd },
            {
                key: "spentVsRegisteredPct",
                value: (row) => row.spentVsRegisteredPct,
            },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "month",
        direction: "desc",
    });

    return (
        <div className="flex flex-col gap-3">
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
                            <TableHeaderCell {...headerProps("paidUsd")}>
                                paid (bank)
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("spentUsd")}>
                                spent (meter)
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("creditUsd")}>
                                of it credit
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("registeredUsd")}>
                                registered (us)
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("spentVsRegisteredPct")}
                            >
                                Δ spent vs reg
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.month}|${row.vendor}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{monthLabel(row.month)}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{fmtUsd(row.paidUsd)}</TableCell>
                                <TableCell>{fmtUsd(row.spentUsd)}</TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {fmtUsd(row.creditUsd)}
                                </TableCell>
                                <TableCell>
                                    {fmtUsd(row.registeredUsd)}
                                </TableCell>
                                <TableCell
                                    className={
                                        row.spentVsRegisteredPct != null &&
                                        Math.abs(row.spentVsRegisteredPct) >
                                            DELTA_ALARM_PCT
                                            ? "text-intent-danger-text"
                                            : "text-theme-text-soft"
                                    }
                                >
                                    {fmtPct(row.spentVsRegisteredPct)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
            <Text size="micro" tone="soft">
                paid = Enty compute transactions (bank leg, invoice fallback) ·
                spent = vendor-reported meter · registered = our metering
                (Pollen ≈ $) · – = no data for that plane, never zero · Δ red
                when |Δ| &gt; {DELTA_ALARM_PCT}%
            </Text>
        </div>
    );
}

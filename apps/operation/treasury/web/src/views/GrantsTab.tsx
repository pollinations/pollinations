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
import type { Data, GrantRow } from "../types";

// Sentinel from the grants datasource: 1970-01-01 = no expiry.
const NO_EXPIRY = "1970-01-01";

// Grants have a start/expiry, not a month — the month filter does not apply.
export function visibleGrantRows({
    grantRows,
    vendor,
}: {
    grantRows: GrantRow[];
    vendor: string;
}) {
    return grantRows.filter((row) => vendor === "all" || row.vendor === vendor);
}

export function GrantsTab({
    data,
    vendor = "all",
}: {
    data: Data;
    vendor?: string;
}) {
    const baseRows = useMemo(
        () => visibleGrantRows({ grantRows: data.grants, vendor }),
        [data.grants, vendor],
    );
    const sortColumns = useMemo<SortColumn<GrantRow>[]>(
        () => [
            { key: "vendor", value: (row) => row.vendor },
            { key: "label", value: (row) => row.label },
            { key: "granted", value: (row) => row.granted },
            { key: "currency", value: (row) => row.currency },
            { key: "start", value: (row) => row.start_date },
            {
                key: "expires",
                value: (row) => (row.expires === NO_EXPIRY ? "" : row.expires),
            },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "vendor",
        direction: "asc",
    });
    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("vendor")}>
                            vendor
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("label")}>
                            label
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("granted")}>
                            granted
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            currency
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("start")}>
                            start
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("expires")}>
                            expires
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        rows,
                        (row) => `${row.vendor}|${row.label}`,
                    ).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell>{row.vendor}</TableCell>
                            <TableCell>{row.label || "–"}</TableCell>
                            <TableCell>{row.granted}</TableCell>
                            <TableCell>{row.currency}</TableCell>
                            <TableCell>{row.start_date}</TableCell>
                            <TableCell>
                                {row.expires === NO_EXPIRY ? "–" : row.expires}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

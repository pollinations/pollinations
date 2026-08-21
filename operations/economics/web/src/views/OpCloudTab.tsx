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
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { SourceCell } from "../components/Provenance";
import { fmtNumber, fmtUtcDateTime, utcDateTimeTitle } from "../lib/format";
import { isPreWindowGrantBurnRow } from "../lib/insights";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
} from "../lib/months";
import type { Data, OpCloudRow } from "../types";

function opCloudKey(row: OpCloudRow) {
    return [
        row.start,
        row.source,
        row.vendor,
        row.type,
        row.resource_id,
        row.resource_name,
        row.resource_sku,
        row.resource_count,
        row.model,
        row.credit,
        row.paid,
        row.currency,
    ].join("|");
}

export function OpCloudTab({
    data,
    month = "",
    type = [],
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    type?: ValueFilter;
    vendor?: ValueFilter;
}) {
    const baseRows = useMemo(() => {
        return (data.opCloud ?? []).filter(
            (row) =>
                !isPreWindowGrantBurnRow(row) &&
                matchesMonth(row.start, month) &&
                matchesValue(row.vendor, vendor) &&
                matchesValue(row.type, type),
        );
    }, [data.opCloud, month, vendor, type]);
    const sortColumns = useMemo<SortColumn<OpCloudRow>[]>(
        () => [
            { key: "source", value: (row) => row.source },
            { key: "start", value: (row) => row.start },
            { key: "end", value: (row) => row.end },
            { key: "vendor", value: (row) => row.vendor },
            { key: "type", value: (row) => row.type },
            { key: "model", value: (row) => row.model },
            { key: "credit", value: (row) => row.credit },
            { key: "paid", value: (row) => row.paid },
            { key: "currency", value: (row) => row.currency },
            { key: "evidence", value: (row) => row.evidence },
            { key: "recorded_at", value: (row) => row.recorded_at },
            { key: "resource_sku", value: (row) => row.resource_sku },
            { key: "resource_count", value: (row) => row.resource_count },
            { key: "resource_id", value: (row) => row.resource_id },
            { key: "resource_name", value: (row) => row.resource_name },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "start",
        direction: "desc",
    });

    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell colSpan={2} align="center">
                            Period
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={3}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Cloud
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={3}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Amount
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={3}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Evidence
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={4}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Resource
                        </TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell {...headerProps("start")}>
                            Start
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("end")}>
                            End
                        </TableHeaderCell>
                        <TableHeaderCell
                            className={GROUP_BORDER}
                            {...headerProps("vendor")}
                        >
                            Vendor
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("type")}>
                            Type
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("model")}>
                            Model
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("credit")}
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Signed credit ledger amount from OP Cloud. Negative values are credit-funded burn; positive values are credit awards.",
                                    tables: "op_cloud_api",
                                    sources: "API/CLI/BQ/HC",
                                }}
                            >
                                Credit
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell align="right" {...headerProps("paid")}>
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Signed cash ledger amount from OP Cloud. Negative values are paid burn.",
                                    tables: "op_cloud_api",
                                    sources: "API/CLI/BQ/HC",
                                }}
                            >
                                Paid
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            Currency
                        </TableHeaderCell>
                        <TableHeaderCell
                            className={GROUP_BORDER}
                            {...headerProps("source")}
                        >
                            Source
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("evidence")}>
                            Evidence
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("recorded_at")}>
                            Recorded
                        </TableHeaderCell>
                        <TableHeaderCell
                            className={GROUP_BORDER}
                            {...headerProps("resource_sku")}
                        >
                            SKU
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("resource_count")}>
                            Count
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("resource_id")}>
                            ID
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("resource_name")}>
                            Name
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, opCloudKey).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell
                                className="whitespace-nowrap"
                                title={utcDateTimeTitle(row.start)}
                            >
                                {fmtUtcDateTime(row.start)}
                            </TableCell>
                            <TableCell
                                className="whitespace-nowrap"
                                title={utcDateTimeTitle(row.end)}
                            >
                                {fmtUtcDateTime(row.end)}
                            </TableCell>
                            <TableCell className={GROUP_BORDER}>
                                {row.vendor}
                            </TableCell>
                            <TableCell>{row.type}</TableCell>
                            <TableCell>{row.model}</TableCell>
                            <TableCell align="right" className={GROUP_BORDER}>
                                {fmtNumber(row.credit)}
                            </TableCell>
                            <TableCell align="right">
                                {fmtNumber(row.paid)}
                            </TableCell>
                            <TableCell>{row.currency}</TableCell>
                            <TableCell className={GROUP_BORDER}>
                                <SourceCell sources={[row.source]} />
                            </TableCell>
                            <TableCell>{row.evidence}</TableCell>
                            <TableCell
                                className="whitespace-nowrap"
                                title={utcDateTimeTitle(row.recorded_at)}
                            >
                                {fmtUtcDateTime(row.recorded_at)}
                            </TableCell>
                            <TableCell className={GROUP_BORDER}>
                                {row.resource_sku}
                            </TableCell>
                            <TableCell align="right">
                                {fmtNumber(row.resource_count)}
                            </TableCell>
                            <TableCell>{row.resource_id}</TableCell>
                            <TableCell>{row.resource_name}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

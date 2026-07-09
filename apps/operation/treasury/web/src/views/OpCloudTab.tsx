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
    RAW_OP_STICKY_HEADER,
    RawOpTableScroller,
    type SortColumn,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { SourceCell } from "../components/Provenance";
import { fmtNumber, fmtUtcDateTime, utcDateTimeTitle } from "../lib/format";
import { matchesMonth } from "../lib/months";
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
        row.model,
        row.credit,
        row.paid,
        row.currency,
    ].join("|");
}

export function OpCloudTab({
    data,
    month = "",
    type = "all",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    type?: string;
    vendor?: string;
}) {
    const baseRows = useMemo(() => {
        return (data.opCloud ?? []).filter(
            (row) =>
                matchesMonth(row.start, month) &&
                (vendor === "all" || row.vendor === vendor) &&
                (type === "all" || row.type === type),
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
        <RawOpTableScroller>
            <DataTable className={RAW_OP_STICKY_HEADER}>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("source")}>
                            source
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("start")}>
                            start
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("end")}>
                            end
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("vendor")}>
                            vendor
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("type")}>
                            type
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("model")}>
                            model
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
                        <TableHeaderCell {...headerProps("evidence")}>
                            evidence
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("recorded_at")}>
                            recorded_at
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("resource_sku")}>
                            resource_sku
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("resource_id")}>
                            resource_id
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("resource_name")}>
                            resource_name
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, opCloudKey).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell>
                                <SourceCell sources={[row.source]} />
                            </TableCell>
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
                            <TableCell>{row.vendor}</TableCell>
                            <TableCell>{row.type}</TableCell>
                            <TableCell>{row.model}</TableCell>
                            <TableCell>{fmtNumber(row.credit)}</TableCell>
                            <TableCell>{fmtNumber(row.paid)}</TableCell>
                            <TableCell>{row.currency}</TableCell>
                            <TableCell>{row.evidence}</TableCell>
                            <TableCell
                                className="whitespace-nowrap"
                                title={utcDateTimeTitle(row.recorded_at)}
                            >
                                {fmtUtcDateTime(row.recorded_at)}
                            </TableCell>
                            <TableCell>{row.resource_sku}</TableCell>
                            <TableCell>{row.resource_id}</TableCell>
                            <TableCell>{row.resource_name}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </RawOpTableScroller>
    );
}

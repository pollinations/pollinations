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
import { fmtNumber, fmtPeriod } from "../lib/format";
import { matchesMonth } from "../lib/months";
import type { Data, OpPollenRow } from "../types";

function opPollenKey(row: OpPollenRow) {
    return [row.month, row.source, row.vendor, row.model, row.currency].join(
        "|",
    );
}

export function OpPollenTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const baseRows = useMemo(() => {
        return (data.opPollen ?? []).filter(
            (row) =>
                matchesMonth(row.month, month) &&
                (vendor === "all" || row.vendor === vendor),
        );
    }, [data.opPollen, month, vendor]);
    const sortColumns = useMemo<SortColumn<OpPollenRow>[]>(
        () => [
            { key: "source", value: (row) => row.source },
            { key: "month", value: (row) => row.month },
            { key: "vendor", value: (row) => row.vendor },
            { key: "model", value: (row) => row.model },
            { key: "currency", value: (row) => row.currency },
            { key: "cost_paid", value: (row) => row.cost_paid },
            { key: "cost_quests", value: (row) => row.cost_quests },
            { key: "price_paid", value: (row) => row.price_paid },
            { key: "price_quests", value: (row) => row.price_quests },
            { key: "byop_paid", value: (row) => row.byop_paid },
            { key: "byop_quests", value: (row) => row.byop_quests },
            { key: "model_paid", value: (row) => row.model_paid },
            { key: "model_quests", value: (row) => row.model_quests },
            { key: "requests_paid", value: (row) => row.requests_paid },
            { key: "requests_quests", value: (row) => row.requests_quests },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "month",
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
                        <TableHeaderCell {...headerProps("month")}>
                            month
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("vendor")}>
                            vendor
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("model")}>
                            model
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            currency
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("cost_paid")}>
                            cost_paid
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("cost_quests")}>
                            cost_quests
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("price_paid")}>
                            price_paid
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("price_quests")}>
                            price_quests
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("byop_paid")}>
                            byop_paid
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("byop_quests")}>
                            byop_quests
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("model_paid")}>
                            model_paid
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("model_quests")}>
                            model_quests
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("requests_paid")}>
                            requests_paid
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("requests_quests")}>
                            requests_quests
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, opPollenKey).map(
                        ({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>
                                    <SourceCell sources={[row.source]} />
                                </TableCell>
                                <TableCell>{fmtPeriod(row.month)}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{row.model}</TableCell>
                                <TableCell>{row.currency}</TableCell>
                                <TableCell>
                                    {fmtNumber(row.cost_paid)}
                                </TableCell>
                                <TableCell>
                                    {fmtNumber(row.cost_quests)}
                                </TableCell>
                                <TableCell>
                                    {fmtNumber(row.price_paid)}
                                </TableCell>
                                <TableCell>
                                    {fmtNumber(row.price_quests)}
                                </TableCell>
                                <TableCell>
                                    {fmtNumber(row.byop_paid)}
                                </TableCell>
                                <TableCell>
                                    {fmtNumber(row.byop_quests)}
                                </TableCell>
                                <TableCell>
                                    {fmtNumber(row.model_paid)}
                                </TableCell>
                                <TableCell>
                                    {fmtNumber(row.model_quests)}
                                </TableCell>
                                <TableCell>
                                    {fmtNumber(row.requests_paid)}
                                </TableCell>
                                <TableCell>
                                    {fmtNumber(row.requests_quests)}
                                </TableCell>
                            </TableRow>
                        ),
                    )}
                </TableBody>
            </DataTable>
        </RawOpTableScroller>
    );
}

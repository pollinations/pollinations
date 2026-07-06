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
import type { Data, PollenMonthlyRow } from "../types";

export function PollenTab({
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
            data.pollenMonthly.filter(
                (row) =>
                    matchesMonth(row.month, month) &&
                    (vendor === "all" || row.vendor === vendor),
            ),
        [data.pollenMonthly, month, vendor],
    );
    const sortColumns = useMemo<SortColumn<PollenMonthlyRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "source", value: (row) => row.source },
            { key: "vendor", value: (row) => row.vendor },
            { key: "model", value: (row) => row.model },
            { key: "currency", value: (row) => row.currency },
            { key: "cost_paid", value: (row) => row.cost_paid },
            {
                key: "cost_quests",
                value: (row) => row.cost_quests,
            },
            {
                key: "price_paid",
                value: (row) => row.price_paid,
            },
            {
                key: "price_quests",
                value: (row) => row.price_quests,
            },
            {
                key: "byop_paid",
                value: (row) => row.byop_paid,
            },
            {
                key: "byop_quests",
                value: (row) => row.byop_quests,
            },
            {
                key: "model_paid",
                value: (row) => row.model_paid,
            },
            {
                key: "model_quests",
                value: (row) => row.model_quests,
            },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "month",
        direction: "desc",
    });

    return (
        <div className="flex flex-col gap-4">
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
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.month}|${row.vendor}|${row.model}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{fmtPeriod(row.month)}</TableCell>
                                <TableCell>
                                    <SourceCell sources={[row.source]} />
                                </TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{row.model}</TableCell>
                                <TableCell>{row.currency}</TableCell>
                                <TableCell>{row.cost_paid}</TableCell>
                                <TableCell>{row.cost_quests}</TableCell>
                                <TableCell>{row.price_paid}</TableCell>
                                <TableCell>{row.price_quests}</TableCell>
                                <TableCell>{row.byop_paid}</TableCell>
                                <TableCell>{row.byop_quests}</TableCell>
                                <TableCell>{row.model_paid}</TableCell>
                                <TableCell>{row.model_quests}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

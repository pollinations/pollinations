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
import type { Data, UsageMonthlyRow } from "../types";

function ecosystemCredit(row: UsageMonthlyRow): number {
    return (
        row.byop_credit_paid_pollen +
        row.byop_credit_quest_pollen +
        row.community_credit_paid_pollen +
        row.community_credit_quest_pollen
    );
}

function retainedPollen(row: UsageMonthlyRow): number {
    return row.price_paid + row.price_quests - ecosystemCredit(row);
}

export function BurnTab({
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
            data.usageMonthly.filter(
                (row) =>
                    matchesMonth(row.month, month) &&
                    (vendor === "all" || row.vendor === vendor),
            ),
        [data.usageMonthly, month, vendor],
    );
    const sortColumns = useMemo<SortColumn<UsageMonthlyRow>[]>(
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
                key: "byop_credit_paid_pollen",
                value: (row) => row.byop_credit_paid_pollen,
            },
            {
                key: "byop_credit_quest_pollen",
                value: (row) => row.byop_credit_quest_pollen,
            },
            {
                key: "community_credit_paid_pollen",
                value: (row) => row.community_credit_paid_pollen,
            },
            {
                key: "community_credit_quest_pollen",
                value: (row) => row.community_credit_quest_pollen,
            },
            {
                key: "ecosystem_credit",
                value: ecosystemCredit,
            },
            {
                key: "retained_pollen",
                value: retainedPollen,
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
                                gross_paid
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("price_quests")}>
                                gross_quest
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("byop_credit_paid_pollen")}
                            >
                                byop_paid
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("byop_credit_quest_pollen")}
                            >
                                byop_quest
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("community_credit_paid_pollen")}
                            >
                                community_paid
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps(
                                    "community_credit_quest_pollen",
                                )}
                            >
                                community_quest
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("ecosystem_credit")}
                            >
                                ecosystem_credit
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("retained_pollen")}
                            >
                                retained
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
                                <TableCell>
                                    {row.byop_credit_paid_pollen}
                                </TableCell>
                                <TableCell>
                                    {row.byop_credit_quest_pollen}
                                </TableCell>
                                <TableCell>
                                    {row.community_credit_paid_pollen}
                                </TableCell>
                                <TableCell>
                                    {row.community_credit_quest_pollen}
                                </TableCell>
                                <TableCell>{ecosystemCredit(row)}</TableCell>
                                <TableCell>{retainedPollen(row)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

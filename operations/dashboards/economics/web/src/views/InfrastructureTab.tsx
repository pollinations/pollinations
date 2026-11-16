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
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
} from "../components/DataTable";
import { useAmountDisplay } from "../components/ReconcilePro";
import { StatCards } from "../components/StatCards";
import { type ApiCost, infrastructureReport } from "../lib/apiCosts";
import { hasVisibleAmount } from "../lib/format";
import type { Data } from "../types";

const SORT_COLUMNS: readonly SortColumn<ApiCost>[] = [
    { key: "vendor", value: (row) => row.vendor },
    { key: "service", value: (row) => row.service },
    { key: "cashUsd", value: (row) => row.cashUsd },
    { key: "creditUsd", value: (row) => row.creditUsd },
    { key: "totalUsd", value: (row) => row.totalUsd },
];

export function InfrastructureTab({
    data,
    month,
}: {
    data: Data;
    month: string;
}) {
    const { fmtUsd, pro } = useAmountDisplay();
    const { rows, summary } = useMemo(
        () => infrastructureReport(data, month),
        [data, month],
    );
    const { headerProps, rows: sortedRows } = useSortableRows(
        rows.filter(
            (row) =>
                pro ||
                hasVisibleAmount([row.cashUsd, row.creditUsd, row.totalUsd]),
        ),
        SORT_COLUMNS,
        { key: "totalUsd", direction: "desc" },
    );
    return (
        <div className="flex flex-col gap-4">
            <StatCards
                items={[
                    {
                        label: "Total infrastructure cost",
                        value: fmtUsd(summary?.totalUsd ?? null),
                    },
                    {
                        label: "Cash-funded",
                        value: fmtUsd(summary?.cashUsd ?? null),
                    },
                    {
                        label: "Credit-funded",
                        value: fmtUsd(summary?.creditUsd ?? null),
                    },
                ]}
            />
            <TableScroller>
                <DataTable className="min-w-[600px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("vendor")}>
                                Provider
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("service")}>
                                Service
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("cashUsd")}
                            >
                                <HeaderHint hint="Cash-funded infrastructure costs for the service month.">
                                    Cash
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("creditUsd")}
                            >
                                <HeaderHint hint="Provider credits used to cover infrastructure costs.">
                                    Credits
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("totalUsd")}
                            >
                                <HeaderHint hint="Cash plus used provider credits.">
                                    Total cost
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sortedRows.map((row) => (
                            <TableRow
                                key={JSON.stringify([row.vendor, row.service])}
                            >
                                <TableCell className="font-semibold">
                                    {row.vendor}
                                </TableCell>
                                <TableCell>{row.service}</TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(row.cashUsd)}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(row.creditUsd)}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(row.totalUsd)}
                                </TableCell>
                            </TableRow>
                        ))}
                        {!sortedRows.length && (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="py-8 text-center text-theme-text-soft"
                                >
                                    {rows.length
                                        ? "Recorded service amounts are all below $1."
                                        : "No infrastructure costs recorded for this month."}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

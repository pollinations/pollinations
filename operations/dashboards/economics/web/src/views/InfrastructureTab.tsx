import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo } from "react";
import { DataTable, TableScroller } from "../components/DataTable";
import { useAmountDisplay } from "../components/ReconcilePro";
import { StatCards } from "../components/StatCards";
import { infrastructureReport } from "../lib/apiCosts";
import type { Data } from "../types";

export function InfrastructureTab({
    data,
    month,
}: {
    data: Data;
    month: string;
}) {
    const { fmtUsd } = useAmountDisplay();
    const { rows, summary } = useMemo(
        () => infrastructureReport(data, month),
        [data, month],
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
                            <TableHeaderCell>Provider</TableHeaderCell>
                            <TableHeaderCell>Service</TableHeaderCell>
                            <TableHeaderCell align="right">
                                Cash
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                Credits
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                Total cost
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow
                                key={JSON.stringify([row.vendor, row.service])}
                            >
                                <TableCell>{row.vendor}</TableCell>
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
                        {!rows.length && (
                            <TableRow>
                                <TableCell colSpan={5}>
                                    No infrastructure costs recorded for this
                                    month.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

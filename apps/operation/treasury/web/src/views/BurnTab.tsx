import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo } from "react";
import { DataNote } from "../components/DataNote";
import { DataTable, TableScroller } from "../components/DataTable";
import { SourceMark } from "../components/Provenance";
import type { Data, UsageMonthlyRow } from "../types";

function sortedUsage(rows: UsageMonthlyRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.provider.localeCompare(b.provider) ||
            a.model.localeCompare(b.model),
    );
}

function fmtCount(value: number | null | undefined): string {
    if (value == null) return "-";
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPollen(value: number | null | undefined): string {
    if (value == null) return "-";
    return value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    });
}

export function BurnTab({ data }: { data: Data }) {
    const rows = useMemo(
        () => sortedUsage(data.usageMonthly),
        [data.usageMonthly],
    );

    return (
        <div className="flex flex-col gap-4">
            <DataNote pipe="usage_ep" rows={rows.length}>
                <SourceMark code="TB" /> generation events -&gt; usage_monthly
                -&gt; one model/month row. Use this table to inspect paid vs
                quest Pollen burn before any provider reconciliation.
            </DataNote>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>month</TableHeaderCell>
                            <TableHeaderCell>provider</TableHeaderCell>
                            <TableHeaderCell>model</TableHeaderCell>
                            <TableHeaderCell>
                                billable_requests_paid_pollen
                            </TableHeaderCell>
                            <TableHeaderCell>
                                billable_requests_quest_pollen
                            </TableHeaderCell>
                            <TableHeaderCell>cost_paid_pollen</TableHeaderCell>
                            <TableHeaderCell>cost_quest_pollen</TableHeaderCell>
                            <TableHeaderCell>
                                billable_paid_pollen
                            </TableHeaderCell>
                            <TableHeaderCell>
                                billable_quest_pollen
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow
                                key={`${row.month}|${row.provider}|${row.model}`}
                            >
                                <TableCell>{row.month}</TableCell>
                                <TableCell>{row.provider}</TableCell>
                                <TableCell>{row.model || "-"}</TableCell>
                                <TableCell>
                                    {fmtCount(
                                        row.billable_requests_paid_pollen,
                                    )}
                                </TableCell>
                                <TableCell>
                                    {fmtCount(
                                        row.billable_requests_quest_pollen,
                                    )}
                                </TableCell>
                                <TableCell>
                                    {fmtPollen(row.cost_paid_pollen)}
                                </TableCell>
                                <TableCell>
                                    {fmtPollen(row.cost_quest_pollen)}
                                </TableCell>
                                <TableCell>
                                    {fmtPollen(row.billable_paid_pollen)}
                                </TableCell>
                                <TableCell>
                                    {fmtPollen(row.billable_quest_pollen)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

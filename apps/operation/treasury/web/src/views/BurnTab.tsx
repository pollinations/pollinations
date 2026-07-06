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

function sortedUsage(rows: UsageMonthlyRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.provider.localeCompare(b.provider) ||
            a.model.localeCompare(b.model),
    );
}

function aggregateUsage(rows: UsageMonthlyRow[]) {
    const byKey = new Map<string, UsageMonthlyRow>();
    for (const row of rows) {
        const key = `${row.month}|${row.provider}|${row.model}`;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, { ...row });
            continue;
        }
        existing.cost_paid_pollen += row.cost_paid_pollen;
        existing.cost_quest_pollen += row.cost_quest_pollen;
        existing.billable_paid_pollen += row.billable_paid_pollen;
        existing.billable_quest_pollen += row.billable_quest_pollen;
    }
    return [...byKey.values()];
}

function fmtPollen(value: number | null | undefined): string {
    if (value == null) return "-";
    return value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    });
}

export function BurnTab({
    data,
    month = "",
    provider = "all",
}: {
    data: Data;
    month?: string;
    provider?: string;
}) {
    const baseRows = useMemo(
        () =>
            sortedUsage(aggregateUsage(data.usageMonthly)).filter(
                (row) =>
                    matchesMonth(row.month, month) &&
                    (provider === "all" || row.provider === provider),
            ),
        [data.usageMonthly, month, provider],
    );
    const sortColumns = useMemo<SortColumn<UsageMonthlyRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "source", value: (row) => row.source },
            { key: "provider", value: (row) => row.provider },
            { key: "model", value: (row) => row.model },
            { key: "cost_paid_pollen", value: (row) => row.cost_paid_pollen },
            {
                key: "cost_quest_pollen",
                value: (row) => row.cost_quest_pollen,
            },
            {
                key: "billable_paid_pollen",
                value: (row) => row.billable_paid_pollen,
            },
            {
                key: "billable_quest_pollen",
                value: (row) => row.billable_quest_pollen,
            },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns);

    return (
        <div className="flex flex-col gap-4">
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("month")}>
                                time period
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("source")}>
                                source
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("provider")}>
                                provider
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("model")}>
                                model
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("cost_paid_pollen")}
                                title="cost_paid_pollen"
                            >
                                paid cost
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("cost_quest_pollen")}
                                title="cost_quest_pollen"
                            >
                                quest cost
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("billable_paid_pollen")}
                                title="billable_paid_pollen"
                            >
                                paid billable
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("billable_quest_pollen")}
                                title="billable_quest_pollen"
                            >
                                quest billable
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) =>
                                `${row.month}|${row.provider}|${row.model}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{fmtPeriod(row.month)}</TableCell>
                                <TableCell>
                                    <SourceCell sources={[row.source]} />
                                </TableCell>
                                <TableCell>{row.provider}</TableCell>
                                <TableCell>{row.model || "-"}</TableCell>
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

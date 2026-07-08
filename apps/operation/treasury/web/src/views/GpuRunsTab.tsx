import {
    Alert,
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
import { fmtNumber } from "../lib/format";
import { matchesMonth } from "../lib/months";
import type { Data, GpuRunRow } from "../types";

export function visibleRunRows({
    runRows,
    month,
    vendor,
}: {
    runRows: GpuRunRow[];
    month: string;
    vendor: string;
}) {
    return runRows.filter(
        (row) =>
            matchesMonth(row.month, month) &&
            (vendor === "all" || row.vendor === vendor),
    );
}

export function runsEmptyNotice(
    runRows: GpuRunRow[],
    visibleRows: GpuRunRow[],
): string | null {
    if (runRows.length === 0) {
        return "No GPU runs ingested yet — run python3 -m ingest.run --only runs";
    }
    if (visibleRows.length === 0) {
        const months = runRows.map((r) => r.month).sort();
        const minMonth = months[0];
        const maxMonth = months[months.length - 1];
        const rowCount = runRows.length;
        return `No GPU runs match this period — runs exist from ${minMonth} to ${maxMonth} (${rowCount} rows). Switch the period filter.`;
    }
    return null;
}

export function GpuRunsTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const baseRows = useMemo(
        () => visibleRunRows({ runRows: data.gpuRuns, month, vendor }),
        [data.gpuRuns, month, vendor],
    );
    const sortColumns = useMemo<SortColumn<GpuRunRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "vendor", value: (row) => row.vendor },
            { key: "deployment", value: (row) => row.deployment },
            { key: "gpu", value: (row) => row.gpu },
            { key: "gpus", value: (row) => row.gpu_count },
            { key: "started", value: (row) => row.started_at },
            { key: "ended", value: (row) => row.ended_at },
            { key: "hours", value: (row) => row.hours ?? -Infinity },
            { key: "cost", value: (row) => row.cost },
            { key: "cur", value: (row) => row.currency },
            { key: "model", value: (row) => row.model },
            { key: "kind", value: (row) => row.kind },
            { key: "source", value: (row) => row.source },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "month",
        direction: "desc",
    });

    const notice = runsEmptyNotice(data.gpuRuns, baseRows);

    return (
        <>
            {notice && <Alert intent="warning">{notice}</Alert>}
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("month")}>
                                month
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("vendor")}>
                                vendor
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("deployment")}>
                                deployment
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("gpu")}>
                                gpu
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("gpus")}>
                                gpus
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("started")}>
                                started
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("ended")}>
                                ended
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("hours")}>
                                hours
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("cost")}>
                                cost
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("cur")}>
                                cur
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("model")}>
                                model
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("kind")}>
                                kind
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("source")}>
                                source
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.run_id}|${row.month}|${row.source}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{row.month}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{row.deployment}</TableCell>
                                <TableCell>{row.gpu || "–"}</TableCell>
                                <TableCell>{row.gpu_count}</TableCell>
                                <TableCell>{row.started_at || "–"}</TableCell>
                                <TableCell>{row.ended_at || "–"}</TableCell>
                                <TableCell className="text-right">
                                    {fmtNumber(row.hours)}
                                </TableCell>
                                <TableCell className="text-right">
                                    {fmtNumber(row.cost)}
                                </TableCell>
                                <TableCell>{row.currency}</TableCell>
                                <TableCell>{row.model || "–"}</TableCell>
                                <TableCell>{row.kind}</TableCell>
                                <TableCell>{row.source}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </>
    );
}

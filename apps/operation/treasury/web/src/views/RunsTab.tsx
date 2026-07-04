import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { fmtPeriod } from "../lib/format";
import type { Data, RunRow } from "../types";

export function RunsTab({ data }: { data: Data }) {
    const sortColumns = useMemo<SortColumn<RunRow>[]>(
        () => [
            { key: "run_at", value: (run) => run.run_at },
            { key: "ok", value: (run) => run.ok },
            { key: "statuses", value: (run) => run.statuses },
            { key: "notes", value: (run) => run.notes },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(data.runs, sortColumns);

    return (
        <div className="flex flex-col gap-4">
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("run_at")}>
                                time period
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("ok")}>
                                ok
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("statuses")}>
                                statuses
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("notes")}>
                                notes
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(rows, (run) => run.run_at).map(
                            ({ key, row: run }) => (
                                <TableRow key={key}>
                                    <TableCell>{fmtPeriod(run.run_at)}</TableCell>
                                    <TableCell>{run.ok}</TableCell>
                                    <TableCell title={run.statuses}>
                                        <code className="font-mono text-xs">
                                            {run.statuses || "{}"}
                                        </code>
                                    </TableCell>
                                    <TableCell>{run.notes || "-"}</TableCell>
                                </TableRow>
                            ),
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
            {data.runs.length === 0 && (
                <Text tone="soft">
                    No runs recorded yet. Is the runs_ep pipe deployed?
                </Text>
            )}
        </div>
    );
}

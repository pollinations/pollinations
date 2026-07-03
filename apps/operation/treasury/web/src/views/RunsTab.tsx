import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { DataNote } from "../components/DataNote";
import { DataTable, TableScroller } from "../components/DataTable";
import type { Data } from "../types";

export function RunsTab({ data }: { data: Data }) {
    return (
        <div className="flex flex-col gap-4">
            <DataNote
                pipe="runs_ep"
                rows={data.runs.length}
                source="Forager execution log"
                transform="Forager run recorder"
                purpose="verify freshness before trusting tables"
            />
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>run_at</TableHeaderCell>
                            <TableHeaderCell>ok</TableHeaderCell>
                            <TableHeaderCell>statuses</TableHeaderCell>
                            <TableHeaderCell>notes</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.runs.map((run) => (
                            <TableRow key={run.run_at}>
                                <TableCell>{run.run_at}</TableCell>
                                <TableCell>{run.ok}</TableCell>
                                <TableCell title={run.statuses}>
                                    <code className="font-mono text-xs">
                                        {run.statuses || "{}"}
                                    </code>
                                </TableCell>
                                <TableCell>
                                    <Text as="span" tone="soft">
                                        {run.notes || "-"}
                                    </Text>
                                </TableCell>
                            </TableRow>
                        ))}
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

import {
    Alert,
    Chip,
    Heading,
    Surface,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useModelEvals } from "./hooks/useModelEvals";

function percent(value) {
    return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function Comparison({ row }) {
    if (!row.community || !row.officialMatch) return <Text size="xs" tone="soft">-</Text>;
    const significant = row.comparison?.significant;
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <Text size="xs">{row.officialMatch}</Text>
            {row.comparison && (
                <Chip intent={significant ? "warning" : "neutral"} size="sm">
                    gap {percent(row.comparison.gap)}
                </Chip>
            )}
        </div>
    );
}

export function EvalsPage() {
    const { run, history, selectedRunId, loading, error, selectRun } =
        useModelEvals();

    return (
        <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-1">
                <Heading as="h1" size="title" className="polli:m-0 sm:text-5xl">
                    Model Evals
                </Heading>
                <Text className="m-0 max-w-3xl">
                    Weekly randomized Alice-in-Wonderland and bowls reasoning checks,
                    graded by code. Errors and timeouts count as failed trials.
                </Text>
            </section>

            {error && <Alert intent="warning">{error}</Alert>}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <Text size="sm" tone="soft">
                    {run
                        ? `${run.models.length} models  |  ${run.trialsPerFamily} trial(s) per family  |  ${Number(run.totalCost).toFixed(6)} Pollen`
                        : "No published run yet"}
                </Text>
                {history.length > 0 && (
                    <label className="flex items-center gap-2 text-sm">
                        <span>Run</span>
                        <select
                            className="rounded-md border border-theme-border bg-theme-bg-base px-2 py-1 text-sm"
                            value={selectedRunId ?? ""}
                            onChange={(event) => selectRun(event.target.value)}
                        >
                            {history.map((entry) => (
                                <option key={entry.runId} value={entry.runId}>
                                    {entry.runId}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            {loading && !run && <Text tone="soft">Loading eval results...</Text>}

            {run && (
                <Surface className="max-w-full overflow-x-auto p-0">
                    <Table className="min-w-[58rem]">
                        <TableHead>
                            <tr>
                                <TableHeaderCell>Model</TableHeaderCell>
                                <TableHeaderCell align="right" numeric>
                                    Score
                                </TableHeaderCell>
                                <TableHeaderCell align="right" numeric>
                                    Margin
                                </TableHeaderCell>
                                <TableHeaderCell align="right" numeric>
                                    Failures
                                </TableHeaderCell>
                                <TableHeaderCell>Official comparison</TableHeaderCell>
                                <TableHeaderCell align="right" numeric>
                                    Cost
                                </TableHeaderCell>
                            </tr>
                        </TableHead>
                        <TableBody>
                            {run.models.map((row) => (
                                <TableRow key={row.model}>
                                    <TableCell>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span>{row.model}</span>
                                            {row.community && (
                                                <Chip intent="neutral" size="sm">
                                                    community
                                                </Chip>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {percent(row.score)}
                                    </TableCell>
                                    <TableCell align="right" numeric muted>
                                        +/-{percent(row.marginOfError)}
                                    </TableCell>
                                    <TableCell align="right" numeric muted>
                                        {row.failures}/{row.total}
                                    </TableCell>
                                    <TableCell>
                                        <Comparison row={row} />
                                    </TableCell>
                                    <TableCell align="right" numeric muted>
                                        {Number(row.cost || 0).toFixed(6)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Surface>
            )}

            {run && (
                <Text size="xs" tone="soft" className="m-0">
                    Run {run.runId}  |  seed {run.runSeed}  |  families: {run.families.join(", ")}
                </Text>
            )}
        </div>
    );
}

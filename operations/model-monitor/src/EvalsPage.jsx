import {
    Alert,
    Chip,
    Heading,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useModelEvals } from "./hooks/useModelEvals";

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function ScoreCell({ model }) {
    return (
        <TableCell align="right" numeric>
            {formatPercent(model.score)}{" "}
            <Text as="span" size="xs" tone="soft">
                &plusmn;{formatPercent(model.marginOfError)}
            </Text>
        </TableCell>
    );
}

function ComparisonBadge({ model }) {
    const cmp = model.comparedToOfficial;
    if (!cmp) return null;
    const gapPct = formatPercent(Math.abs(cmp.gap));
    if (!cmp.exceedsMarginOfError) {
        return (
            <Chip intent="neutral" size="sm">
                matches {cmp.officialModel}
            </Chip>
        );
    }
    return (
        <Chip intent="danger" size="sm">
            {cmp.gap < 0 ? "-" : "+"}
            {gapPct} vs {cmp.officialModel}
        </Chip>
    );
}

export function EvalsPage() {
    const { run, history, selectedRunId, loading, error, selectRun } =
        useModelEvals();

    return (
        <div className="flex flex-col gap-4">
            <section className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                    <Heading as="h2" size="lg" className="polli:m-0">
                        Weekly evals
                    </Heading>
                    <Text className="m-0 max-w-3xl">
                        Every text model scored on the same randomized
                        Alice-in-Wonderland style puzzles. New numbers each run,
                        graded by code.
                    </Text>
                </div>
                {history.length > 0 && (
                    <select
                        className="rounded-md border border-theme-border bg-theme-bg-base px-2 py-1 text-sm"
                        value={selectedRunId || ""}
                        onChange={(e) => selectRun(e.target.value)}
                    >
                        {history.map((entry) => (
                            <option key={entry.runId} value={entry.runId}>
                                {entry.runId}
                            </option>
                        ))}
                    </select>
                )}
            </section>

            {error && (
                <Alert intent="info" title="No results yet">
                    {error} — the weekly workflow publishes the first
                    leaderboard once maintainers add the eval API key.
                </Alert>
            )}

            {!error && !loading && run && (
                <>
                    <Text size="xs" tone="soft" className="m-0">
                        Run {run.runId} &middot; {run.families.join(", ")}{" "}
                        &middot; {run.trialsPerFamily} trial(s) per family
                        &middot; cost {run.totalCostPollen.toFixed(4)} Pollen
                    </Text>
                    <Table className="min-w-[48rem]">
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>Model</TableHeaderCell>
                                <TableHeaderCell>Publisher</TableHeaderCell>
                                <TableHeaderCell align="right">
                                    Score
                                </TableHeaderCell>
                                <TableHeaderCell align="right">
                                    Failed
                                </TableHeaderCell>
                                <TableHeaderCell>
                                    Namesake check
                                </TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {run.models.map((model) => (
                                <TableRow key={model.name}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span>
                                                {model.title || model.name}
                                            </span>
                                            <Text
                                                size="xs"
                                                tone="soft"
                                                className="m-0"
                                            >
                                                {model.name}
                                            </Text>
                                        </div>
                                    </TableCell>
                                    <TableCell muted>
                                        {model.publisher || "-"}
                                    </TableCell>
                                    <ScoreCell model={model} />
                                    <TableCell align="right" numeric muted>
                                        {model.failed}/{model.total}
                                    </TableCell>
                                    <TableCell>
                                        <ComparisonBadge model={model} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </>
            )}
        </div>
    );
}

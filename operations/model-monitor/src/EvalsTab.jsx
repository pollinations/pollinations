import {
    Alert,
    Button,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { evalLeaderboard, scoreDelta } from "./evals-data.js";
import { useEvals } from "./hooks/useEvals";

function formatPercent(value) {
    return `${(value * 100).toFixed(0)}%`;
}

function formatMargin(value) {
    return `±${(value * 100).toFixed(1)}%`;
}

function formatCost(pollen) {
    if (pollen === null || pollen === undefined) return "-";
    return `${pollen.toFixed(2)} pollen`;
}

function formatRunDate(iso) {
    if (!iso) return "-";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-GB", {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

// The score chip carries the margin of error so two models whose intervals
// overlap never look meaningfully different.
function ScoreCell({ model }) {
    return (
        <span className="tabular-nums">
            {formatPercent(model.score)}
            <span className="text-xs text-theme-text-muted">
                {" "}
                {formatMargin(model.marginOfError)}
            </span>
        </span>
    );
}

// A community model shown beneath its official namesake, with the score
// gap highlighted only when it exceeds the combined margins of error.
function GapChip({ gap }) {
    if (!gap) return null;
    if (!gap.significant) return null;
    const drop = gap.gap > 0;
    return (
        <Chip
            intent={drop ? "warning" : "success"}
            size="sm"
            title={`Official minus community score: ${formatPercent(gap.gap)}, outside the combined ±${formatMargin(gap.combinedMargin)}`}
        >
            {drop ? "-" : "+"}
            {formatPercent(Math.abs(gap.gap))} vs official
        </Chip>
    );
}

function DeltaCell({ delta }) {
    if (delta === null || Math.abs(delta) < 0.0005) {
        return <span className="text-theme-text-muted">-</span>;
    }
    const up = delta > 0;
    return (
        <span
            className={`tabular-nums ${up ? "text-intent-success-text" : "text-intent-danger-text"}`}
        >
            {up ? "+" : "-"}
            {formatPercent(Math.abs(delta))}
        </span>
    );
}

export function EvalsTab() {
    const { run, history, loading, error, refresh } = useEvals();

    if (loading) {
        return <Text>Loading eval results…</Text>;
    }

    if (error) {
        return (
            <Alert intent="warning" title="No eval results">
                <div className="flex items-center gap-2">
                    <span>
                        {error}. The weekly eval workflow publishes the
                        leaderboard here once it has completed a run.
                    </span>
                    <Button size="sm" variant="ghost" onClick={refresh}>
                        Retry
                    </Button>
                </div>
            </Alert>
        );
    }

    const rows = evalLeaderboard(run.models);

    return (
        <div className="flex flex-col gap-4">
            <Text size="sm" tone="soft" className="m-0">
                AIW reasoning eval (LAION question families, answers computed by
                code). Every text model answers the same fresh questions weekly;
                community models named after official models are shown beneath
                them, with gaps highlighted only when they exceed the combined
                margins of error.
            </Text>

            <div className="flex flex-wrap gap-x-6 gap-y-1">
                <Text size="xs" tone="soft" className="m-0">
                    Run: <strong>{formatRunDate(run.startedAt)}</strong>
                </Text>
                <Text size="xs" tone="soft" className="m-0">
                    Models scored: <strong>{run.scoredCount}</strong>
                </Text>
                <Text size="xs" tone="soft" className="m-0">
                    Questions: <strong>{run.questionCount ?? "-"}</strong> (
                    {run.families.join(", ")})
                </Text>
                <Text size="xs" tone="soft" className="m-0">
                    Cost: <strong>{formatCost(run.costPollen)}</strong>
                </Text>
            </div>

            <Table>
                <TableHead>
                    <TableHeaderCell>Model</TableHeaderCell>
                    <TableHeaderCell align="right">Score</TableHeaderCell>
                    <TableHeaderCell align="right">Correct</TableHeaderCell>
                    <TableHeaderCell align="right">vs last run</TableHeaderCell>
                    <TableHeaderCell align="right">Cost</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {rows.map(({ model, paired, gap }) => (
                        <TableRow key={model.name}>
                            <TableCell className="w-full min-w-[16rem] max-w-0 overflow-hidden">
                                <div className="min-w-0">
                                    <div
                                        className={`truncate font-medium text-theme-text-strong ${paired ? "pl-4" : ""}`}
                                        title={model.name}
                                    >
                                        {model.name}
                                    </div>
                                    {paired && (
                                        <div className="truncate text-micro text-theme-text-muted">
                                            named after {paired.name}
                                        </div>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell align="right">
                                <div className="flex items-center justify-end gap-1.5">
                                    <ScoreCell model={model} />
                                    <GapChip gap={gap} />
                                </div>
                            </TableCell>
                            <TableCell align="right" numeric muted>
                                {model.correct ?? "-"}/{model.total ?? "-"}
                            </TableCell>
                            <TableCell align="right">
                                <DeltaCell
                                    delta={scoreDelta(history, model.name)}
                                />
                            </TableCell>
                            <TableCell align="right" numeric muted>
                                {formatCost(model.costPollen)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {history.length > 1 && (
                <div className="flex flex-col gap-2">
                    <Text size="sm" tone="soft" className="m-0">
                        Past runs
                    </Text>
                    <Table>
                        <TableHead>
                            <TableHeaderCell>Run</TableHeaderCell>
                            <TableHeaderCell align="right">
                                Models scored
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                Cost
                            </TableHeaderCell>
                        </TableHead>
                        <TableBody>
                            {history.map((pastRun) => (
                                <TableRow key={pastRun.runId}>
                                    <TableCell>
                                        {formatRunDate(pastRun.startedAt)}
                                    </TableCell>
                                    <TableCell align="right" numeric muted>
                                        {pastRun.scoredCount ?? "-"}
                                    </TableCell>
                                    <TableCell align="right" numeric muted>
                                        {formatCost(pastRun.costPollen)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}

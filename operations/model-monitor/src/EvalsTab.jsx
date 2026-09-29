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
import { useEffect, useState } from "react";
import {
    fetchEvalsData,
    formatBalanceRun,
    formatCost,
    formatGap,
    formatMargin,
    formatScore,
    formatWhen,
    pairSeverity,
    rankingWithPairs,
} from "./evals-data.js";

const HISTORY_ROWS = 8;

function ModelCell({ entry }) {
    const { row, indent, pair } = entry;
    return (
        <TableCell>
            <span
                className="inline-flex min-w-0 items-center gap-2"
                style={{ paddingLeft: indent ? "1.5rem" : 0 }}
            >
                <span className="truncate font-medium">{row.name}</span>
                <Chip intent="neutral" size="sm">
                    {row.scope}
                </Chip>
                {pair && (
                    <Chip
                        intent={pairSeverity(pair)}
                        size="sm"
                        title={`Same name as ${pair.official}: gap ${formatGap(pair)} with a combined margin of ${formatMargin(pair.marginOfError)}`}
                    >
                        {pair.exceedsMargin
                            ? `! ${formatGap(pair)} ${formatMargin(pair.marginOfError)}`
                            : formatGap(pair)}
                    </Chip>
                )}
            </span>
        </TableCell>
    );
}

function StatusCell({ row }) {
    if (row.status === "scored" && row.failures === 0) {
        return (
            <TableCell align="right" numeric muted>
                -
            </TableCell>
        );
    }
    const label =
        row.status === "partial"
            ? "Budget stop"
            : row.failures > 0
              ? `${row.failures} failed`
              : row.status;
    return (
        <TableCell align="right">
            <Chip
                intent={row.status === "partial" ? "warning" : "danger"}
                size="sm"
            >
                {label}
            </Chip>
        </TableCell>
    );
}

function RankingTable({ report }) {
    const entries = rankingWithPairs(report);
    return (
        <Surface variant="card" className="max-w-full overflow-x-auto p-0">
            <Table className="min-w-[52rem]">
                <TableHead>
                    <tr>
                        <TableHeaderCell className="w-12">#</TableHeaderCell>
                        <TableHeaderCell>Model</TableHeaderCell>
                        <TableHeaderCell align="right">Score</TableHeaderCell>
                        <TableHeaderCell align="right">
                            <span title="Wilson 95% confidence interval">
                                Range
                            </span>
                        </TableHeaderCell>
                        <TableHeaderCell align="right">
                            Answered
                        </TableHeaderCell>
                        <TableHeaderCell align="right">Format</TableHeaderCell>
                        <TableHeaderCell align="right">
                            <span title="Spent on this model in this run">
                                Cost
                            </span>
                        </TableHeaderCell>
                        <TableHeaderCell align="right">Issues</TableHeaderCell>
                    </tr>
                </TableHead>
                <TableBody>
                    {entries.map((entry) => {
                        const { row } = entry;
                        return (
                            <TableRow key={`${row.scope}-${row.name}`}>
                                <TableCell numeric muted>
                                    {row.rank ?? "-"}
                                </TableCell>
                                <ModelCell entry={entry} />
                                <TableCell align="right" numeric>
                                    {formatScore(row.score)}
                                    <span className="ml-1 text-theme-text-muted">
                                        {formatMargin(row.marginOfError)}
                                    </span>
                                </TableCell>
                                <TableCell align="right" numeric muted>
                                    {formatScore(row.scoreLower)} –{" "}
                                    {formatScore(row.scoreUpper)}
                                </TableCell>
                                <TableCell align="right" numeric muted>
                                    {row.correct}/{row.asked}
                                </TableCell>
                                <TableCell align="right" numeric muted>
                                    {row.formatted}/{row.asked}
                                </TableCell>
                                <TableCell align="right" numeric muted>
                                    {formatCost(row.costPollen, row.costKnown)}
                                </TableCell>
                                <StatusCell row={row} />
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </Surface>
    );
}

function RecentRuns({ history }) {
    if (!history || history.runs.length === 0) return null;
    const runs = history.runs.slice(0, HISTORY_ROWS);
    return (
        <>
            <Heading as="h3" size="subsection" className="polli:m-0 mt-2">
                Past runs
            </Heading>
            <Surface variant="card" className="max-w-full overflow-x-auto p-0">
                <Table className="min-w-[40rem]">
                    <TableHead>
                        <tr>
                            <TableHeaderCell>Started</TableHeaderCell>
                            <TableHeaderCell align="right">
                                Models
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                Questions
                            </TableHeaderCell>
                            <TableHeaderCell>Leader</TableHeaderCell>
                            <TableHeaderCell align="right">
                                Cost
                            </TableHeaderCell>
                        </tr>
                    </TableHead>
                    <TableBody>
                        {runs.map((run) => (
                            <TableRow key={run.id}>
                                <TableCell muted>
                                    {formatWhen(run.startedAt)}
                                </TableCell>
                                <TableCell align="right" numeric muted>
                                    {run.modelCount}
                                </TableCell>
                                <TableCell align="right" numeric muted>
                                    {run.askedQuestions}
                                </TableCell>
                                <TableCell>
                                    {run.ranking[0]?.name ?? "-"}
                                    <span className="ml-2 text-theme-text-muted">
                                        {run.ranking[0]
                                            ? formatScore(run.ranking[0].score)
                                            : ""}
                                    </span>
                                </TableCell>
                                <TableCell align="right" numeric muted>
                                    {formatCost(run.costPollen)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Surface>
        </>
    );
}

function RunSummary({ report }) {
    const parts = [
        report.evalTitle,
        `v${report.evalVersion}`,
        `${report.scoredModels} of ${report.modelCount} models scored`,
        `${report.correctTotal}/${report.askedQuestions} questions answered correctly`,
        `${report.costPollen.toFixed(6)} pollen of a ${report.budgetPollen} pollen budget`,
        `seed ${report.seed}`,
        `run took ${report.durationSec.toFixed(1)}s`,
    ];
    return (
        <>
            <Text className="m-0 max-w-3xl">{parts.join(" · ")}</Text>
            <Text size="xs" tone="soft" className="m-0">
                Families: {report.families.join(", ")} ·{" "}
                {report.questionsPerFamily} questions per family · balance{" "}
                {formatBalanceRun(report)}
                {report.costUnknownModels.length > 0
                    ? ` · pricing unknown for ${report.costUnknownModels.join(", ")}`
                    : ""}
            </Text>
        </>
    );
}

export function EvalsTab() {
    const [state, setState] = useState({ loading: true, data: null });

    useEffect(() => {
        let cancelled = false;
        fetchEvalsData().then((data) => {
            if (!cancelled) setState({ loading: false, data });
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (state.loading) {
        return (
            <Text size="sm" tone="soft" className="m-0">
                Loading the latest leaderboard…
            </Text>
        );
    }

    const data = state.data;
    if (data?.error) {
        return (
            <Alert intent="danger" title="Evals unavailable">
                {data.error}
            </Alert>
        );
    }

    if (!data?.report) {
        return (
            <Alert intent="info" title="No leaderboard yet">
                The weekly eval has not published a result on the news branch
                yet. Once the workflow runs, the ranking appears here.
            </Alert>
        );
    }

    const { report, history } = data;
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <Heading as="h2" size="section" className="polli:m-0">
                    {report.evalTitle}
                </Heading>
                <Text size="xs" tone="soft" className="m-0">
                    Latest run: {formatWhen(report.startedAt)}
                    {report.evalSource ? ` · source: ${report.evalSource}` : ""}
                </Text>
            </div>

            <RunSummary report={report} />

            <RankingTable report={report} />

            {report.notRun.length > 0 && (
                <Text size="xs" tone="soft" className="m-0">
                    Not run:{" "}
                    {report.notRun
                        .map((entry) => `${entry.name} (${entry.reason})`)
                        .join(", ")}
                </Text>
            )}

            {report.pairs.length > 0 && (
                <Text size="xs" tone="soft" className="m-0">
                    Community models named after an official model are shown
                    under it; a gap bigger than the combined margin of error is
                    flagged with <span className="font-semibold">!</span>.
                </Text>
            )}

            <RecentRuns history={history} />
        </div>
    );
}

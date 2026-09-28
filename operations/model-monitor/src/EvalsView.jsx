import {
    Alert,
    Chip,
    ExternalLinkButton,
    Heading,
    Surface,
    TabButton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useEffect, useState } from "react";
import { buildLeaderboard, EVALS_DATA_URL } from "./eval-data.js";

const PAST_RUNS_SHOWN = 8;

const percent = (value) => `${Math.round(value * 100)}%`;
const points = (gap) =>
    `${gap > 0 ? "+" : "−"}${Math.round(Math.abs(gap) * 100)} pts`;

async function fetchJson(path) {
    const res = await fetch(`${EVALS_DATA_URL}/${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Evals data error: ${res.status}`);
    return res.json();
}

function useEvals() {
    const [index, setIndex] = useState(null);
    const [runId, setRunId] = useState(null);
    const [run, setRun] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchJson("index.json")
            .then((data) => {
                setIndex(data?.runs ?? []);
                setRunId(data?.runs?.[0]?.id ?? null);
                if (!data?.runs?.length) setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (!runId) return;
        setLoading(true);
        fetchJson(`runs/${runId}.json`)
            .then(setRun)
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [runId]);

    return { index, runId, setRunId, run, error, loading };
}

function ScoreCell({ model }) {
    return (
        <span className="tabular-nums">
            {percent(model.rate)}{" "}
            <span className="opacity-60">±{percent(model.moe)}</span>
        </span>
    );
}

function TwinPairs({ pairs }) {
    if (pairs.length === 0) return null;
    return (
        <section className="flex flex-col gap-2">
            <Heading as="h2" size="section" className="polli:m-0">
                Community vs official
            </Heading>
            <Text size="xs" tone="soft" className="m-0">
                Community models named after an official model, next to it. A
                gap is highlighted when it is bigger than the two margins of
                error combined.
            </Text>
            <Surface variant="card" className="max-w-full overflow-x-auto p-0">
                <Table className="min-w-[40rem]">
                    <TableHead>
                        <tr>
                            <TableHeaderCell>Community model</TableHeaderCell>
                            <TableHeaderCell align="right">
                                Score
                            </TableHeaderCell>
                            <TableHeaderCell>Official model</TableHeaderCell>
                            <TableHeaderCell align="right">
                                Score
                            </TableHeaderCell>
                            <TableHeaderCell align="right">Gap</TableHeaderCell>
                        </tr>
                    </TableHead>
                    <TableBody>
                        {pairs.map(
                            ({ community, official, gap, significant }) => (
                                <TableRow
                                    key={community.name}
                                    intent={significant ? "danger" : "default"}
                                >
                                    <TableCell>{community.name}</TableCell>
                                    <TableCell align="right" numeric>
                                        <ScoreCell model={community} />
                                    </TableCell>
                                    <TableCell>{official.name}</TableCell>
                                    <TableCell align="right" numeric>
                                        <ScoreCell model={official} />
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {significant ? (
                                            <Chip intent="danger" size="sm">
                                                {points(gap)}
                                            </Chip>
                                        ) : (
                                            <span className="opacity-70">
                                                {points(gap)}
                                            </span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ),
                        )}
                    </TableBody>
                </Table>
            </Surface>
        </section>
    );
}

function Ranking({ evalResult, ranking }) {
    return (
        <Surface variant="card" className="max-w-full overflow-x-auto p-0">
            <Table className="min-w-[48rem]">
                <TableHead>
                    <tr>
                        <TableHeaderCell className="w-10">#</TableHeaderCell>
                        <TableHeaderCell>Model</TableHeaderCell>
                        <TableHeaderCell align="right">Score</TableHeaderCell>
                        {evalResult.families.map((family) => (
                            <TableHeaderCell key={family} align="right">
                                {family}
                            </TableHeaderCell>
                        ))}
                        <TableHeaderCell align="right">
                            <span title="Errors and timeouts, counted as wrong answers">
                                Failed
                            </span>
                        </TableHeaderCell>
                        <TableHeaderCell align="right">Pollen</TableHeaderCell>
                    </tr>
                </TableHead>
                <TableBody>
                    {ranking.map((model, position) => (
                        <TableRow key={model.name}>
                            <TableCell muted>{position + 1}</TableCell>
                            <TableCell>
                                {model.name}{" "}
                                {model.community && (
                                    <Chip intent="neutral" size="sm">
                                        community
                                    </Chip>
                                )}
                            </TableCell>
                            <TableCell align="right" numeric>
                                <ScoreCell model={model} />
                            </TableCell>
                            {evalResult.families.map((family) => (
                                <TableCell
                                    key={family}
                                    align="right"
                                    numeric
                                    muted
                                >
                                    {model.families[family].correct}/
                                    {model.families[family].total}
                                </TableCell>
                            ))}
                            <TableCell align="right" numeric muted>
                                {model.failed || "-"}
                            </TableCell>
                            <TableCell align="right" numeric muted>
                                {model.cost.toFixed(4)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Surface>
    );
}

export default function EvalsView() {
    const { index, runId, setRunId, run, error, loading } = useEvals();

    if (error) {
        return (
            <Alert intent="danger" title="Evals unavailable">
                {error}
            </Alert>
        );
    }
    if (index && index.length === 0) {
        return (
            <Alert intent="info" title="No eval results yet">
                The weekly run publishes its first results here.
            </Alert>
        );
    }
    if (!run) {
        return (
            <Text tone="soft">
                {loading ? "Loading results…" : "No results."}
            </Text>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <Text size="xs" tone="soft" className="m-0">
                    Run of {new Date(run.date).toISOString().slice(0, 10)} ·
                    seed {run.seed} · {run.samples} questions per family ·{" "}
                    {(run.cost.balanceChange ?? run.cost.estimated).toFixed(2)}{" "}
                    Pollen
                </Text>
                <span className="inline-flex flex-wrap gap-1">
                    {index.slice(0, PAST_RUNS_SHOWN).map((entry) => (
                        <TabButton
                            key={entry.id}
                            active={entry.id === runId}
                            onClick={() => setRunId(entry.id)}
                            size="sm"
                        >
                            {entry.date.slice(0, 10)}
                        </TabButton>
                    ))}
                </span>
            </div>
            {run.evals.map((evalResult) => {
                const { ranking, pairs, skipped } = buildLeaderboard(
                    evalResult.models,
                );
                return (
                    <div key={evalResult.id} className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <Heading
                                as="h2"
                                size="section"
                                className="polli:m-0"
                            >
                                {evalResult.title}
                            </Heading>
                            <ExternalLinkButton
                                href={evalResult.source}
                                size="sm"
                            >
                                Source
                            </ExternalLinkButton>
                        </div>
                        <TwinPairs pairs={pairs} />
                        <Ranking evalResult={evalResult} ranking={ranking} />
                        {skipped.length > 0 && (
                            <Text size="xs" tone="soft" className="m-0">
                                Not run (budget reached):{" "}
                                {skipped.map((m) => m.name).join(", ")}
                            </Text>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

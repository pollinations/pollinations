import {
    Alert,
    Chip,
    ClockIcon,
    InlineLink,
    Surface,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Text,
    WarningIcon,
} from "@pollinations/ui";
import { useEffect, useRef, useState } from "react";
import { buildLeaderboard, EVALS_DATA_URL } from "./eval-data.js";
import SortableTh from "./SortableTh.jsx";

const PAIR_SORTS = {
    community: (a, b) => a.community.name.localeCompare(b.community.name),
    communityScore: (a, b) => a.community.rate - b.community.rate,
    official: (a, b) => a.official.name.localeCompare(b.official.name),
    officialScore: (a, b) => a.official.rate - b.official.rate,
    gap: (a, b) => shownGap(a) - shownGap(b),
};
// Names start A→Z; scores and gaps start highest first.
const ASC_FIRST = new Set(["community", "official"]);

const percent = (value) => `${Math.round(value * 100)}%`;
// The difference of the two scores as shown, so it always adds up on screen.
const shownGap = ({ community, official }) =>
    Math.round(community.rate * 100) - Math.round(official.rate * 100);
// Only gaps beyond both 95% ranges are flagged. Clearly below its namesake is
// red (broken, or not that model); clearly above is amber (a different model,
// not a harmful one).
const highlight = ({ community, official, significant }) => {
    if (!significant) return "default";
    return community.rate < official.rate ? "danger" : "warning";
};
const signed = (value) =>
    `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}%`;

async function fetchJson(path) {
    const res = await fetch(`${EVALS_DATA_URL}/${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Results error: ${res.status}`);
    return res.json();
}

/** The latest run's results, fetched the first time `active` is true. */
export function useEvals(active) {
    const fetched = useRef(false);
    const [state, setState] = useState({ loading: true });

    useEffect(() => {
        if (!active || fetched.current) return;
        fetched.current = true;
        fetchJson("index.json")
            .then((index) => {
                const latest = index?.runs?.[0];
                return latest ? fetchJson(`runs/${latest.id}.json`) : null;
            })
            .then((run) => setState({ run }))
            .catch((err) => setState({ error: err.message }));
    }, [active]);

    return state;
}

// Same model cell as the health table: title, with the full id below. The
// official side is right-aligned so the two models mirror each other.
function ModelCell({ name, title, align = "left" }) {
    const label = title || name.split("/").pop() || name;
    return (
        <TableCell
            align={align}
            className="w-1/2 min-w-[12rem] max-w-0 overflow-hidden"
        >
            <div className="truncate font-medium text-theme-text-strong">
                {label}
            </div>
            {(title || name !== label) && (
                <div
                    className="truncate text-micro text-theme-text-muted"
                    title={name}
                >
                    {name}
                </div>
            )}
        </TableCell>
    );
}

// Scores face each other across the difference; the confidence range sits in
// the hover note.
function ScoreCell({ model, align }) {
    return (
        <TableCell
            align={align}
            numeric
            className="w-20 whitespace-nowrap font-semibold"
        >
            <span
                title={`95% confidence: ${percent(model.lower)}–${percent(model.upper)}`}
            >
                {percent(model.rate)}
            </span>
        </TableCell>
    );
}

function TwinPairs({ pairs, titles }) {
    const [sort, setSort] = useState({ key: "gap", asc: false });
    const handleSort = (key) => {
        setSort((prev) => ({
            key,
            asc: prev.key === key ? !prev.asc : ASC_FIRST.has(key),
        }));
    };
    const sorted = [...pairs].sort(
        (a, b) => (sort.asc ? 1 : -1) * PAIR_SORTS[sort.key](a, b),
    );
    const scoreLabel = (
        <span title="Share of questions answered correctly; hover a score for its 95% confidence range">
            Score
        </span>
    );

    return (
        <Surface variant="card" className="max-w-full overflow-x-auto p-0">
            <Table className="min-w-[44rem]">
                <TableHead>
                    <tr>
                        <SortableTh
                            label="Community"
                            sortKey="community"
                            currentSort={sort}
                            onSort={handleSort}
                        />
                        <SortableTh
                            label={scoreLabel}
                            sortKey="communityScore"
                            currentSort={sort}
                            onSort={handleSort}
                            align="right"
                        />
                        <SortableTh
                            label={
                                <span title="Community minus official. Red when clearly lower, amber when clearly higher: the two 95% confidence ranges do not overlap">
                                    Difference
                                </span>
                            }
                            sortKey="gap"
                            currentSort={sort}
                            onSort={handleSort}
                            align="center"
                        />
                        <SortableTh
                            label={scoreLabel}
                            sortKey="officialScore"
                            currentSort={sort}
                            onSort={handleSort}
                        />
                        <SortableTh
                            label="Official (reference)"
                            sortKey="official"
                            currentSort={sort}
                            onSort={handleSort}
                            align="right"
                        />
                    </tr>
                </TableHead>
                <TableBody>
                    {sorted.length === 0 ? (
                        <TableRow>
                            <TableCell
                                colSpan={5}
                                align="center"
                                className="py-8 text-theme-text-muted"
                            >
                                No community model in this run is named after an
                                official model
                            </TableCell>
                        </TableRow>
                    ) : (
                        sorted.map((pair) => {
                            const { community, official } = pair;
                            const intent = highlight(pair);
                            const difference = signed(shownGap(pair));
                            return (
                                <TableRow key={community.name} intent={intent}>
                                    <ModelCell
                                        name={community.name}
                                        title={titles.get(community.name)}
                                    />
                                    <ScoreCell
                                        model={community}
                                        align="right"
                                    />
                                    <TableCell
                                        align="center"
                                        numeric
                                        className="w-28 whitespace-nowrap"
                                    >
                                        <Chip
                                            intent={
                                                intent === "default"
                                                    ? "neutral"
                                                    : intent
                                            }
                                            size="sm"
                                        >
                                            <span className="font-semibold">
                                                {difference}
                                            </span>
                                        </Chip>
                                    </TableCell>
                                    <ScoreCell model={official} align="left" />
                                    <ModelCell
                                        name={official.name}
                                        title={titles.get(official.name)}
                                        align="right"
                                    />
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
        </Surface>
    );
}

export default function TrustView({ run, error, loading, catalog }) {
    if (error) {
        return (
            <Alert intent="danger" title="Results unavailable">
                {error}
            </Alert>
        );
    }
    if (loading) {
        return <Text tone="soft">Loading results…</Text>;
    }
    if (!run) {
        return (
            <Alert intent="info" title="No results yet">
                The weekly run publishes its first results here.
            </Alert>
        );
    }

    return (
        <>
            {run.evals.map((evalResult) => (
                <TwinPairs
                    key={evalResult.id}
                    pairs={buildLeaderboard(evalResult.models).pairs}
                    titles={
                        new Map(
                            catalog.map((model) => [model.name, model.title]),
                        )
                    }
                />
            ))}
            {/* Footnotes styled like Enter's: small muted lines, each led by
                an icon. */}
            <div className="space-y-2 px-1 text-[13px] leading-snug text-theme-text-muted">
                <p className="flex items-start gap-1.5">
                    <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Every week each text model answers the same trick
                        questions, and each community model is compared with the
                        official model it is named after.{" "}
                        <InlineLink
                            href={run.evals[0].source}
                            className="whitespace-nowrap"
                        >
                            Question source
                        </InlineLink>
                    </span>
                </p>
                <p className="flex items-start gap-1.5">
                    <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        A low score can also mean the endpoint returned errors.
                    </span>
                </p>
            </div>
        </>
    );
}

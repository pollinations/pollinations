import {
    Chip,
    ExternalLinkButton,
    Heading,
    Section,
    StatCard,
    Surface,
    Text,
} from "@pollinations/ui";
import { useEffect, useState } from "react";

export type QuestLeaderboardEntry = {
    githubLogin: string;
    completedQuests: number;
    totalPollen: number;
};

export type QuestLeaderboardData = {
    leaderboard: QuestLeaderboardEntry[];
    totals: {
        contributors: number;
        completedQuests: number;
        totalPollen: number;
    };
};

type QuestLeaderboardState =
    | { status: "loading" }
    | { status: "ready"; data: QuestLeaderboardData }
    | { status: "failed" };

const LEADERBOARD_API = "https://enter.pollinations.ai/api/quests/leaderboard";
const QUESTS_PAGE_URL = "https://enter.pollinations.ai/quests";
const VISIBLE_CONTRIBUTORS = 8;

function formatNumber(value: number) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function isLeaderboardData(value: unknown): value is QuestLeaderboardData {
    if (!value || typeof value !== "object") return false;

    const candidate = value as Partial<QuestLeaderboardData>;
    return (
        Array.isArray(candidate.leaderboard) &&
        candidate.leaderboard.every(
            (entry) =>
                typeof entry.githubLogin === "string" &&
                typeof entry.completedQuests === "number" &&
                typeof entry.totalPollen === "number",
        ) &&
        typeof candidate.totals?.contributors === "number" &&
        typeof candidate.totals.completedQuests === "number" &&
        typeof candidate.totals.totalPollen === "number"
    );
}

function LeaderboardAction() {
    return (
        <ExternalLinkButton
            href={QUESTS_PAGE_URL}
            size="sm"
            appearance="raised"
        >
            Browse open quests
        </ExternalLinkButton>
    );
}

/** Pure view exported so the rendered leaderboard can be tested without fetch. */
export function QuestLeaderboardContent({
    data,
}: {
    data: QuestLeaderboardData;
}) {
    const visible = data.leaderboard.slice(0, VISIBLE_CONTRIBUTORS);

    return (
        <Section
            title="Quest leaderboard"
            intro="Builders who completed public GitHub Pollen Quests."
            action={<LeaderboardAction />}
            className="gap-5"
            titleClassName="font-subheading text-3xl leading-tight sm:text-4xl"
        >
            <dl
                className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-3"
                aria-label="Quest leaderboard totals"
            >
                <Surface as="div" variant="card">
                    <StatCard
                        label="Builders"
                        value={formatNumber(data.totals.contributors)}
                        className="flex flex-col"
                        labelClassName="order-2 font-normal text-xs normal-case tracking-normal"
                        valueClassName="order-1 mt-0 font-heading font-normal text-3xl text-theme-text-soft"
                    />
                </Surface>
                <Surface as="div" variant="card">
                    <StatCard
                        label="Completed quests"
                        value={formatNumber(data.totals.completedQuests)}
                        className="flex flex-col"
                        labelClassName="order-2 font-normal text-xs normal-case tracking-normal"
                        valueClassName="order-1 mt-0 font-heading font-normal text-3xl text-theme-text-soft"
                    />
                </Surface>
                <Surface as="div" variant="card">
                    <StatCard
                        label="Quest Pollen"
                        value={formatNumber(data.totals.totalPollen)}
                        className="flex flex-col"
                        labelClassName="order-2 font-normal text-xs normal-case tracking-normal"
                        valueClassName="order-1 mt-0 font-heading font-normal text-3xl text-theme-text-soft"
                    />
                </Surface>
            </dl>

            {visible.length > 0 ? (
                <ol className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
                    {visible.map((entry, index) => (
                        <li key={entry.githubLogin}>
                            <Surface
                                as="a"
                                variant="card"
                                href={`https://github.com/${encodeURIComponent(entry.githubLogin)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex h-full items-center gap-3 transition-colors hover:bg-theme-bg-subtle"
                            >
                                <Chip
                                    intent="neutral"
                                    size="sm"
                                    aria-label={`Rank ${index + 1}`}
                                    className="w-8"
                                >
                                    {index + 1}
                                </Chip>
                                <img
                                    src={`https://github.com/${encodeURIComponent(entry.githubLogin)}.png?size=64`}
                                    alt=""
                                    aria-hidden="true"
                                    className="size-9 shrink-0 rounded-full bg-theme-bg-subtle"
                                    loading="lazy"
                                    decoding="async"
                                    width={36}
                                    height={36}
                                />
                                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <Heading
                                        as="span"
                                        size="card"
                                        className="truncate"
                                    >
                                        @{entry.githubLogin}
                                    </Heading>
                                    <Text as="span" size="xs" tone="muted">
                                        {formatNumber(entry.completedQuests)}{" "}
                                        completed
                                    </Text>
                                </span>
                                <Text
                                    as="strong"
                                    size="xs"
                                    tone="strong"
                                    weight="bold"
                                    className="shrink-0 tabular-nums"
                                >
                                    {formatNumber(entry.totalPollen)} Pollen
                                </Text>
                            </Surface>
                        </li>
                    ))}
                </ol>
            ) : (
                <Text size="sm" tone="muted">
                    No completed public quests yet.
                </Text>
            )}
        </Section>
    );
}

export function QuestLeaderboard() {
    const [state, setState] = useState<QuestLeaderboardState>({
        status: "loading",
    });

    useEffect(() => {
        const controller = new AbortController();

        fetch(LEADERBOARD_API, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) throw new Error("Quest leaderboard failed");
                return response.json() as Promise<unknown>;
            })
            .then((body) => {
                setState(
                    isLeaderboardData(body)
                        ? { status: "ready", data: body }
                        : { status: "failed" },
                );
            })
            .catch((error: unknown) => {
                if (
                    error instanceof DOMException &&
                    error.name === "AbortError"
                ) {
                    return;
                }
                setState({ status: "failed" });
            });

        return () => controller.abort();
    }, []);

    if (state.status === "ready") {
        return <QuestLeaderboardContent data={state.data} />;
    }

    return (
        <Section
            title="Quest leaderboard"
            intro="Builders who completed public GitHub Pollen Quests."
            action={<LeaderboardAction />}
            className="gap-5"
            titleClassName="font-subheading text-3xl leading-tight sm:text-4xl"
        >
            {state.status === "loading" ? (
                <output
                    className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2"
                    aria-label="Loading Quest leaderboard"
                    aria-busy="true"
                >
                    {Array.from({ length: 4 }, (_, index) => (
                        <div
                            key={`leaderboard-placeholder-${index + 1}`}
                            aria-hidden="true"
                            className="h-16 animate-pulse rounded-xl bg-theme-bg-subtle"
                        />
                    ))}
                </output>
            ) : (
                <Text size="sm" tone="muted">
                    The Quest leaderboard couldn’t be loaded right now.
                </Text>
            )}
        </Section>
    );
}

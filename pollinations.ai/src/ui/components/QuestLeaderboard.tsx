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
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { usePageCopy } from "../../hooks/usePageCopy";

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

const LEADERBOARD_API = "https://enter.pollinations.ai/api/quests/leaderboard";
const QUESTS_PAGE_URL = "https://enter.pollinations.ai/quests";
const VISIBLE_CONTRIBUTORS = 8;

/** Pure view exported so the rendered leaderboard can be tested without fetch. */
export function QuestLeaderboardContent({
    data,
}: {
    data: QuestLeaderboardData;
}) {
    const { copy } = usePageCopy(COMMUNITY_PAGE);
    const visible = data.leaderboard.slice(0, VISIBLE_CONTRIBUTORS);

    return (
        <Section
            title={copy.questLeaderboardTitle}
            intro={copy.questLeaderboardDescription}
            action={
                <ExternalLinkButton
                    href={QUESTS_PAGE_URL}
                    size="md"
                    intent="brand"
                    external={false}
                >
                    {copy.questLeaderboardCta}
                </ExternalLinkButton>
            }
            className="gap-5"
            titleClassName="font-subheading text-3xl leading-tight sm:text-4xl"
        >
            <dl
                className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-3"
                aria-label={copy.questLeaderboardTotalsLabel}
            >
                {(
                    [
                        [
                            copy.questLeaderboardBuildersLabel,
                            data.totals.contributors,
                        ],
                        [
                            copy.questLeaderboardCompletedLabel,
                            data.totals.completedQuests,
                        ],
                        [
                            copy.questLeaderboardPollenLabel,
                            data.totals.totalPollen,
                        ],
                    ] as const
                ).map(([label, value]) => (
                    <Surface key={label} as="div" variant="card">
                        <StatCard
                            label={label}
                            value={value}
                            className="flex flex-col"
                            labelClassName="order-2 font-normal text-xs normal-case tracking-normal"
                            valueClassName="order-1 mt-0 font-heading font-normal text-3xl text-theme-text-soft"
                        />
                    </Surface>
                ))}
            </dl>

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
                                aria-hidden="true"
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
                                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <Text
                                        as="span"
                                        size="xs"
                                        tone="muted"
                                        className="whitespace-nowrap"
                                    >
                                        {entry.completedQuests}{" "}
                                        {copy.questLeaderboardRowCompletedLabel}
                                    </Text>
                                    <Text
                                        as="strong"
                                        size="xs"
                                        tone="strong"
                                        weight="bold"
                                        className="whitespace-nowrap tabular-nums"
                                    >
                                        {entry.totalPollen}{" "}
                                        {copy.questLeaderboardRowPollenLabel}
                                    </Text>
                                </span>
                            </span>
                        </Surface>
                    </li>
                ))}
            </ol>
        </Section>
    );
}

/** Fetches the small public aggregate; failure keeps the optional section hidden. */
export function QuestLeaderboard() {
    const [data, setData] = useState<QuestLeaderboardData | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetch(LEADERBOARD_API, { headers: { Accept: "application/json" } })
            .then(async (response) => {
                if (!response.ok) return null;
                return (await response.json()) as QuestLeaderboardData;
            })
            .then((body) => {
                if (
                    !cancelled &&
                    body &&
                    Array.isArray(body.leaderboard) &&
                    body.leaderboard.length > 0
                ) {
                    setData(body);
                }
            })
            .catch(() => {
                // Optional community section: leave it hidden on network failure.
            });

        return () => {
            cancelled = true;
        };
    }, []);

    if (!data) return null;

    return <QuestLeaderboardContent data={data} />;
}
